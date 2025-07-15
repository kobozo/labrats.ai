import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Store from 'electron-store';
import { ConfigManager } from './config';
import { GitService } from './gitService';
import { TerminalService } from './terminalService';
import { LABRATS_CONFIG_DIR } from './constants';
import { AIProvider, AIModel, AIProviderConfig } from '../types/ai-provider';
import { getAIProviderManager } from '../services/ai-provider-manager';
import { chatHistoryManager } from './chat-history-manager';
import { setupMcpIpcHandlers } from './mcp/mcp-ipc-handlers';

app.name = 'LabRats.AI';

const isDev = process.env.NODE_ENV === 'development';

interface RecentProject {
  path: string;
  lastOpened: string;
  name: string;
}

interface WindowState {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized: boolean;
  projectPath: string;
}

// Ensure the LabRats configuration directory exists before we attempt to
// write any files into it. While `electron-store` will also create the
// directory lazily, doing it explicitly keeps our behaviour clear and
// avoids relying on implementation details.
if (!fs.existsSync(LABRATS_CONFIG_DIR)) {
  fs.mkdirSync(LABRATS_CONFIG_DIR, { recursive: true });
}

/**
 * Safely initialize electron-store with automatic backup and recovery
 * for corrupted JSON files
 */
function createSafeStore(): any {
  const storeConfig = {
    cwd: LABRATS_CONFIG_DIR,
    name: 'projects',
    defaults: {
      recentProjects: [] as RecentProject[],
      windowStates: [] as WindowState[],
      lastActiveWindows: [] as string[],
      projectStates: {} as { [key: string]: any }
    }
  };

  try {
    return new Store(storeConfig);
  } catch (error) {
    console.error('Failed to load projects.json, attempting recovery:', error);
    
    const projectsJsonPath = path.join(LABRATS_CONFIG_DIR, 'projects.json');
    
    // Check if the file exists and is corrupted
    if (fs.existsSync(projectsJsonPath)) {
      try {
        // Create backup with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(LABRATS_CONFIG_DIR, `projects.backup.${timestamp}.json`);
        
        console.log(`Backing up corrupted projects.json to: ${backupPath}`);
        fs.copyFileSync(projectsJsonPath, backupPath);
        
        // Remove corrupted file
        fs.unlinkSync(projectsJsonPath);
        console.log('Removed corrupted projects.json file');
        
        // Create fresh store
        console.log('Creating fresh projects.json with default values');
        return new Store(storeConfig);
        
      } catch (backupError) {
        console.error('Failed to backup corrupted file:', backupError);
        // Even if backup fails, try to remove the corrupted file and start fresh
        try {
          fs.unlinkSync(projectsJsonPath);
          return new Store(storeConfig);
        } catch (removeError) {
          console.error('Failed to remove corrupted file:', removeError);
          throw new Error('Could not recover from corrupted projects.json file');
        }
      }
    } else {
      // File doesn't exist, which is fine - electron-store will create it
      return new Store(storeConfig);
    }
  }
}

const store: any = createSafeStore();

const windows = new Map<number, BrowserWindow>();
const windowProjects = new Map<number, string>();
const configManager = new ConfigManager();
const gitServices = new Map<number, GitService>();
const terminalService = TerminalService.getInstance();

function createWindow(projectPath?: string, windowState?: WindowState): BrowserWindow {
  const defaultBounds = {
    width: configManager.get('window', 'defaultWidth'),
    height: configManager.get('window', 'defaultHeight'),
    x: undefined as number | undefined,
    y: undefined as number | undefined
  };

  const bounds = windowState?.bounds || defaultBounds;

  const window = new BrowserWindow({
    ...bounds,
    title: 'LabRats.ai',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 20 },
  });

  if (windowState?.isMaximized) {
    window.maximize();
  }

  windows.set(window.id, window);
  
  if (projectPath) {
    windowProjects.set(window.id, projectPath);
    updateRecentProjects(projectPath);
    
    // Initialize git service for this window
    initializeGitServiceForWindow(window.id, projectPath);
  }

  if (isDev) {
    window.loadURL('http://localhost:3000');
    if (configManager.get('development', 'showDevTools')) {
      window.webContents.openDevTools();
    }
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'));
    if (configManager.get('development', 'showDevTools')) {
      window.webContents.openDevTools();
    }
  }

  // Send the project path once the window is ready
  window.webContents.once('did-finish-load', () => {
    if (projectPath) {
      window.webContents.send('folder-opened', projectPath);
      // Initialize Dexy for this project
      setDexyProjectPath(projectPath);
      // Initialize TODO auto-scanner for this project
      todoAutoScanner.startScanning(projectPath);
      // Set up MCP IPC handlers
      setupMcpIpcHandlers(projectPath);
    }
  });

  // Track window state changes
  window.on('resize', () => saveWindowState(window));
  window.on('move', () => saveWindowState(window));
  window.on('maximize', () => saveWindowState(window));
  window.on('unmaximize', () => saveWindowState(window));

  window.on('closed', () => {
    windows.delete(window.id);
    windowProjects.delete(window.id);
    gitServices.delete(window.id);
    saveOpenWindows();
  });

  return window;
}

// Initialize git service for a window
async function initializeGitServiceForWindow(windowId: number, projectPath: string): Promise<void> {
  console.log(`Initializing git service for window ${windowId} with path: ${projectPath}`);
  const gitService = new GitService();
  
  // Store the service immediately so it's available for IPC calls
  gitServices.set(windowId, gitService);
  
  try {
    const success = await gitService.initializeRepo(projectPath);
    console.log(`Git initialization for ${projectPath}: ${success}`);
    if (success) {
      console.log(`Git repo root: ${gitService.getCurrentRepo()}`);
      
      // Test if git is actually working
      const status = await gitService.getStatus();
      console.log(`Git test - status result:`, status ? 'Got status' : 'No status');
      if (status) {
        console.log(`Git test - files count: ${status.files.length}, branch: ${status.current}`);
      }
    } else {
      console.log(`Git initialization failed for ${projectPath} - not a git repository or git not found`);
      // Remove the service if initialization failed
      gitServices.delete(windowId);
    }
  } catch (error) {
    console.error(`Git initialization error for ${projectPath}:`, error);
    // Remove the service if initialization failed
    gitServices.delete(windowId);
  }
}

function updateRecentProjects(projectPath: string): void {
  const recentProjects = store.get('recentProjects', []) as RecentProject[];
  const projectName = path.basename(projectPath);
  
  // Remove if already exists
  const filtered = recentProjects.filter(p => p.path !== projectPath);
  
  // Add to beginning
  filtered.unshift({
    path: projectPath,
    name: projectName,
    lastOpened: new Date().toISOString()
  });
  
  // Keep only last 10
  const trimmed = filtered.slice(0, 10);
  
  store.set('recentProjects', trimmed);
}

function saveWindowState(window: BrowserWindow): void {
  if (!window || window.isDestroyed()) return;
  
  const projectPath = windowProjects.get(window.id);
  if (!projectPath) return;
  
  const bounds = window.getBounds();
  const isMaximized = window.isMaximized();
  
  const windowStates = store.get('windowStates', []) as WindowState[];
  const filtered = windowStates.filter(ws => ws.projectPath !== projectPath);
  
  filtered.push({
    bounds,
    isMaximized,
    projectPath
  });
  
  store.set('windowStates', filtered);
}

function saveOpenWindows(): void {
  const openProjects = Array.from(windowProjects.values());
  store.set('lastActiveWindows', openProjects);
}

function createMenu(window?: BrowserWindow): void {
  const template: any = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          }
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const targetWindow = window || BrowserWindow.getFocusedWindow() || Array.from(windows.values())[0];
            const result = await dialog.showOpenDialog(targetWindow, {
              properties: ['openDirectory'],
              title: 'Select Folder to Open'
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const projectPath = result.filePaths[0];
              targetWindow.webContents.send('folder-opened', projectPath);
              windowProjects.set(targetWindow.id, projectPath);
              
              // Initialize services for this window
              initializeGitServiceForWindow(targetWindow.id, projectPath);
              setDexyProjectPath(projectPath);
              todoAutoScanner.startScanning(projectPath);
              setupMcpIpcHandlers(projectPath);
              
              updateRecentProjects(projectPath);
              saveOpenWindows();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: []
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            configManager.openConfigFile();
          }
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: process.platform === 'darwin' ? 'Cmd+W' : 'Ctrl+W',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            if (focused) {
              focused.close();
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Update recent projects menu
function updateRecentProjectsMenu(): void {
  const recentProjects = store.get('recentProjects', []) as RecentProject[];
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  
  const fileMenu = menu.items.find(item => item.label === 'File');
  if (!fileMenu || !fileMenu.submenu) return;
  
  const recentItem = fileMenu.submenu.items.find(item => item.label === 'Open Recent');
  if (!recentItem || !recentItem.submenu) return;
  
  // Clear existing items
  (recentItem.submenu as any).clear();
  
  if (recentProjects.length === 0) {
    (recentItem.submenu as any).append(new MenuItem({
      label: 'No Recent Projects',
      enabled: false
    }));
  } else {
    recentProjects.forEach(project => {
      (recentItem.submenu as any).append(new MenuItem({
        label: project.name,
        sublabel: project.path,
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            focusedWindow.webContents.send('folder-opened', project.path);
            windowProjects.set(focusedWindow.id, project.path);
            
            // Initialize services for this window
            initializeGitServiceForWindow(focusedWindow.id, project.path);
            setDexyProjectPath(project.path);
            todoAutoScanner.startScanning(project.path);
            setupMcpIpcHandlers(project.path);
            
            updateRecentProjects(project.path);
            saveOpenWindows();
          } else {
            createWindow(project.path);
          }
        }
      }));
    });
    
    (recentItem.submenu as any).append(new MenuItem({ type: 'separator' }));
    (recentItem.submenu as any).append(new MenuItem({
      label: 'Clear Recent Projects',
      click: () => {
        store.set('recentProjects', []);
        updateRecentProjectsMenu();
      }
    }));
  }
}


// IPC handlers
ipcMain.handle('open-folder', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Folder to Open'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const projectPath = result.filePaths[0];

    // Identify the window that requested the dialog
    const requestingWindow = BrowserWindow.fromWebContents(event.sender);

    if (requestingWindow) {
      requestingWindow.webContents.send('folder-opened', projectPath);
      windowProjects.set(requestingWindow.id, projectPath);
      
      // Initialize services for this window
      initializeGitServiceForWindow(requestingWindow.id, projectPath);
      setDexyProjectPath(projectPath);
      todoAutoScanner.startScanning(projectPath);
      setupMcpIpcHandlers(projectPath);
    }

    updateRecentProjects(projectPath);
    saveOpenWindows();
  }

  return result;
});

ipcMain.handle('get-recent-projects', async () => {
  return store.get('recentProjects', []);
});

ipcMain.handle('remove-recent-project', async (event, projectPath: string) => {
  const recentProjects = store.get('recentProjects', []) as RecentProject[];
  const filtered = recentProjects.filter(p => p.path !== projectPath);
  store.set('recentProjects', filtered);
  updateRecentProjectsMenu();
  return filtered;
});

// Project state management handlers
ipcMain.handle('get-project-state', async (event, key: string) => {
  const projectStates = store.get('projectStates', {}) as { [key: string]: any };
  return projectStates[key] || null;
});

ipcMain.handle('set-project-state', async (event, key: string, value: any) => {
  const projectStates = store.get('projectStates', {}) as { [key: string]: any };
  if (value === null) {
    delete projectStates[key];
  } else {
    projectStates[key] = value;
  }
  store.set('projectStates', projectStates);
  return true;
});

ipcMain.handle('get-all-project-states', async () => {
  const projectStates = store.get('projectStates', {}) as { [key: string]: any };
  return Object.values(projectStates);
});

ipcMain.handle('read-directory', async (event, dirPath: string) => {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const fileTree = [];
    const showHiddenFiles = configManager.get('fileExplorer', 'showHiddenFiles');
    const excludePatterns = configManager.get('fileExplorer', 'excludePatterns');
    
    for (const item of items) {
      // Skip hidden files if configured
      if (!showHiddenFiles && item.name.startsWith('.')) {
        continue;
      }
      
      // Skip excluded patterns
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(item.name);
        }
        return item.name === pattern;
      });
      
      if (shouldExclude) {
        continue;
      }
      
      const fullPath = path.join(dirPath, item.name);
      const stats = await fs.promises.stat(fullPath);
      
      fileTree.push({
        id: fullPath,
        name: item.name,
        type: item.isDirectory() ? 'folder' : 'file',
        path: fullPath,
        lastModified: stats.mtime.toISOString(),
        size: item.isFile() ? formatFileSize(stats.size) : null,
        isExpanded: false,
        children: item.isDirectory() ? [] : undefined
      });
    }
    
    const sortBy = configManager.get('fileExplorer', 'sortBy');
    
    return fileTree.sort((a, b) => {
      // Folders first, then files
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      
      // Then sort by configured method
      switch (sortBy) {
        case 'modified':
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case 'size':
          if (a.type === 'file' && b.type === 'file') {
            const aSize = parseInt(a.size || '0');
            const bSize = parseInt(b.size || '0');
            return bSize - aSize;
          }
          return a.name.localeCompare(b.name);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
});

ipcMain.handle('read-file', async (event, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});

ipcMain.handle('get-file-stats', async (event, filePath: string) => {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: `${(stats.size / 1024).toFixed(2)} KB`,
      modifiedTime: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile()
    };
  } catch (error) {
    console.error('Error getting file stats:', error);
    throw error;
  }
});

ipcMain.handle('get-env', async (event, key: string) => {
  return process.env[key];
});

ipcMain.handle('get-project-path', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    const projectPath = windowProjects.get(window.id);
    if (projectPath) {
      // Ensure MCP handlers are set up for this project
      setupMcpIpcHandlers(projectPath);
      return projectPath;
    }
  }
  return process.cwd();
});

// System API handlers
ipcMain.handle('open-external', async (event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: String(error) };
  }
});

// File search handler
ipcMain.handle('search-files', async (event, rootPath: string, query: string, limit: number = 20) => {
  const results: Array<{ name: string; path: string; type: 'file' | 'directory' }> = [];

  const searchRecursive = async (dir: string) => {
    try {
      const items = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        if (results.length >= limit) break;
        
        // Skip hidden files and common ignore patterns
        if (item.name.startsWith('.') || 
            item.name === 'node_modules' || 
            item.name === 'dist' || 
            item.name === '.git') {
          continue;
        }
        
        const fullPath = path.join(dir, item.name);
        
        // Check if name matches query (case-insensitive) or show all if query is empty
        if (!query || item.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            name: item.name,
            path: fullPath,
            type: item.isDirectory() ? 'directory' : 'file'
          });
        }
        
        // Recursively search directories
        if (item.isDirectory() && results.length < limit) {
          await searchRecursive(fullPath);
        }
      }
    } catch (error) {
      console.error('Error searching directory:', dir, error);
    }
  };
  
  await searchRecursive(rootPath);
  return results;
});

// Config IPC handlers
ipcMain.handle('get-config', async (event, key?: string, property?: string) => {
  if (key && property) {
    return configManager.get(key as any, property as any);
  } else if (key) {
    return configManager.get(key as any);
  } else {
    return configManager.getAll();
  }
});

ipcMain.handle('set-config', async (event, key: string, propertyOrValue: any, value?: any) => {
  if (value !== undefined) {
    configManager.set(key as any, propertyOrValue, value);
  } else {
    configManager.set(key as any, propertyOrValue);
  }
});

ipcMain.handle('reset-config', async () => {
  configManager.reset();
});

ipcMain.handle('get-config-path', async () => {
  return configManager.getConfigPath();
});

ipcMain.handle('get-config-dir', async () => {
  return LABRATS_CONFIG_DIR;
});

// Prompt file handlers
ipcMain.handle('prompt-read', async (event, agentId: string) => {
  try {
    const promptsDir = path.join(LABRATS_CONFIG_DIR, 'prompts');
    const promptPath = path.join(promptsDir, `${agentId}.prompt`);
    
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf-8');
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to read prompt for ${agentId}:`, error);
    return null;
  }
});

ipcMain.handle('prompt-write', async (event, agentId: string, content: string) => {
  try {
    const promptsDir = path.join(LABRATS_CONFIG_DIR, 'prompts');
    
    // Ensure prompts directory exists
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    
    const promptPath = path.join(promptsDir, `${agentId}.prompt`);
    fs.writeFileSync(promptPath, content, 'utf-8');
    
    return true;
  } catch (error) {
    console.error(`Failed to write prompt for ${agentId}:`, error);
    return false;
  }
});

ipcMain.handle('prompt-delete', async (event, agentId: string) => {
  try {
    const promptsDir = path.join(LABRATS_CONFIG_DIR, 'prompts');
    const promptPath = path.join(promptsDir, `${agentId}.prompt`);
    
    if (fs.existsSync(promptPath)) {
      fs.unlinkSync(promptPath);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to delete prompt for ${agentId}:`, error);
    return false;
  }
});

ipcMain.handle('prompt-exists', async (event, agentId: string) => {
  try {
    const promptsDir = path.join(LABRATS_CONFIG_DIR, 'prompts');
    const promptPath = path.join(promptsDir, `${agentId}.prompt`);
    
    return fs.existsSync(promptPath);
  } catch (error) {
    console.error(`Failed to check prompt existence for ${agentId}:`, error);
    return false;
  }
});

ipcMain.handle('prompt-list-custom', async () => {
  try {
    const promptsDir = path.join(LABRATS_CONFIG_DIR, 'prompts');
    
    if (!fs.existsSync(promptsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(promptsDir);
    return files
      .filter(file => file.endsWith('.prompt'))
      .map(file => file.replace('.prompt', ''));
  } catch (error) {
    console.error('Failed to list custom prompts:', error);
    return [];
  }
});

// Simple git service cache based on folder path
const gitServicesByPath = new Map<string, GitService>();

async function getOrCreateGitService(folderPath: string): Promise<GitService | null> {
  // Check if we already have a service for this path
  let gitService = gitServicesByPath.get(folderPath);
  
  if (!gitService) {
    console.log(`Creating new git service for path: ${folderPath}`);
    gitService = new GitService();
    gitServicesByPath.set(folderPath, gitService);
    
    const success = await gitService.initializeRepo(folderPath);
    if (!success) {
      console.log(`Git initialization failed for ${folderPath}`);
      gitServicesByPath.delete(folderPath);
      return null;
    }
  }
  
  return gitService;
}

// Helper to get folder path and git service for IPC handlers
async function getGitServiceForRequest(event: Electron.IpcMainInvokeEvent, folderPath?: string): Promise<{ gitService: GitService | null; folderPath: string | null }> {
  // Try to get folder path from parameter or window
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) {
    return { gitService: null, folderPath: null };
  }
  
  const gitService = await getOrCreateGitService(folderPath);
  return { gitService, folderPath };
}

// Git IPC handlers
ipcMain.handle('git-get-status', async (event, folderPath?: string) => {
  // Try to get folder path from parameter or window
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) {
    console.log('Git get-status: No folder path provided or found');
    return null;
  }
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) {
    return null;
  }
  
  console.log(`Git get-status: Getting status for ${folderPath}`);
  const result = await gitService.getStatus();
  console.log('Git get-status: Result:', result === null ? 'null' : 'data received');
  return result;
});

ipcMain.handle('git-get-diff', async (event, filePath: string, staged: boolean = false, folderPath?: string) => {
  const { gitService, folderPath: resolvedPath } = await getGitServiceForRequest(event, folderPath);
  
  if (!gitService || !resolvedPath) {
    console.log('Git get-diff: No folder path or git service available');
    return null;
  }
  
  console.log(`Git get-diff: Getting diff for ${filePath} in ${resolvedPath}`);
  return await gitService.getDiff(filePath, staged);
});

ipcMain.handle('git-stage-file', async (event, filePath: string, folderPath?: string) => {
  const { gitService } = await getGitServiceForRequest(event, folderPath);
  
  if (!gitService) {
    console.log('Git stage-file: No git service available');
    return false;
  }
  
  return await gitService.stageFile(filePath);
});

ipcMain.handle('git-unstage-file', async (event, filePath: string, folderPath?: string) => {
  const { gitService } = await getGitServiceForRequest(event, folderPath);
  
  if (!gitService) {
    console.log('Git unstage-file: No git service available');
    return false;
  }
  
  return await gitService.unstageFile(filePath);
});

ipcMain.handle('git-discard-changes', async (event, filePath: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.discardChanges(filePath);
});

ipcMain.handle('git-commit', async (event, message: string, folderPath?: string) => {
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) return false;
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) return false;
  
  return await gitService.commit(message);
});

ipcMain.handle('git-initialize', async (event, repoPath: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id) || new GitService();
  const success = await gitService.initializeRepo(repoPath);
  
  if (success) {
    gitServices.set(window.id, gitService);
  }
  
  return success;
});

ipcMain.handle('git-revert-file', async (event, filePath: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.revertFile(filePath);
});

ipcMain.handle('git-stash-push', async (event, message?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.stashPush(message);
});

ipcMain.handle('git-stash-pop', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.stashPop();
});

ipcMain.handle('git-stash-list', async (event, folderPath?: string) => {
  // Try to get folder path from parameter or window
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) {
    console.log('Git stash-list: No folder path provided or found');
    return [];
  }
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) {
    return [];
  }
  
  return await gitService.stashList();
});

ipcMain.handle('git-reset-soft', async (event, commitHash?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.resetSoft(commitHash);
});

ipcMain.handle('git-reset-hard', async (event, commitHash?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.resetHard(commitHash);
});

ipcMain.handle('git-reset-mixed', async (event, commitHash?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.resetMixed(commitHash);
});

ipcMain.handle('git-stage-all', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.stageAllFiles();
});

ipcMain.handle('git-unstage-all', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.unstageAllFiles();
});

ipcMain.handle('git-discard-all', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.discardAllChanges();
});

ipcMain.handle('git-get-branches', async (event, folderPath?: string) => {
  // Try to get folder path from parameter or window
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) {
    console.log('Git get-branches: No folder path provided or found');
    return { current: '', all: [] };
  }
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) {
    return { current: '', all: [] };
  }
  
  console.log(`Git get-branches: Getting branches for ${folderPath}`);
  const result = await gitService.getBranches();
  console.log('Git get-branches: Result:', result);
  return result;
});

ipcMain.handle('git-create-branch', async (event, branchName: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.createBranch(branchName);
});

ipcMain.handle('git-switch-branch', async (event, branchName: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.switchBranch(branchName);
});

ipcMain.handle('git-delete-branch', async (event, branchName: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.deleteBranch(branchName);
});

ipcMain.handle('git-get-commit-history', async (event, count?: number, folderPath?: string) => {
  // Try to get folder path from parameter or window
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) {
    console.log('Git get-commit-history: No folder path provided or found');
    return [];
  }
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) {
    return [];
  }
  
  console.log(`Git get-commit-history: Getting history for ${folderPath}`);
  const result = await gitService.getCommitHistory(count);
  console.log('Git get-commit-history: Result count:', result.length);
  return result;
});

ipcMain.handle('git-clean-untracked', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return false;
  
  return await gitService.cleanUntrackedFiles();
});

ipcMain.handle('git-pull', async (event, folderPath?: string) => {
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) return { success: false, message: 'No folder path provided' };
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) return { success: false, message: 'Git not initialized' };
  
  return await gitService.pull();
});

ipcMain.handle('git-push', async (event, folderPath?: string) => {
  if (!folderPath) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      folderPath = windowProjects.get(window.id);
    }
  }
  
  if (!folderPath) return { success: false, message: 'No folder path provided' };
  
  const gitService = await getOrCreateGitService(folderPath);
  if (!gitService) return { success: false, message: 'Git not initialized' };
  
  return await gitService.push();
});

ipcMain.handle('git-fetch', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return { success: false, message: 'Window not found' };
  
  const gitService = gitServices.get(window.id);
  if (!gitService || !gitService.isInitialized()) return { success: false, message: 'Git not initialized' };
  
  return await gitService.fetch();
});

// Set up terminal event forwarding (once, globally)
terminalService.on('terminal-data', (pid: number, data: string) => {
  // Send to all renderer processes
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('terminal-data', pid, data);
    }
  });
});

terminalService.on('terminal-exit', (pid: number, exitCode: number) => {
  // Send to all renderer processes
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('terminal-exit', pid, exitCode);
    }
  });
});

// Terminal IPC handlers
ipcMain.handle('terminal-create', async (event, options: { cwd: string; cols: number; rows: number }) => {
  try {
    const terminalProcess = await terminalService.createTerminal(options);
    return terminalProcess;
  } catch (error) {
    console.error('Failed to create terminal:', error);
    throw error;
  }
});

ipcMain.handle('terminal-write', async (event, pid: number, data: string) => {
  try {
    terminalService.writeToTerminal(pid, data);
  } catch (error) {
    console.error('Failed to write to terminal:', error);
  }
});

ipcMain.handle('terminal-resize', async (event, pid: number, cols: number, rows: number) => {
  try {
    terminalService.resizeTerminal(pid, cols, rows);
  } catch (error) {
    console.error('Failed to resize terminal:', error);
  }
});

ipcMain.handle('terminal-kill', async (event, pid: number) => {
  try {
    terminalService.killTerminal(pid);
  } catch (error) {
    console.error('Failed to kill terminal:', error);
  }
});

ipcMain.handle('terminal-check-iterm', async (event) => {
  try {
    return await terminalService.checkItermAvailability();
  } catch (error) {
    console.error('Failed to check iTerm availability:', error);
    return false;
  }
});

ipcMain.handle('terminal-open-iterm', async (event, cwd: string) => {
  try {
    return await terminalService.openInIterm(cwd);
  } catch (error) {
    console.error('Failed to open iTerm:', error);
    return false;
  }
});

ipcMain.handle('terminal-change-cwd', async (event, pid: number, newCwd: string) => {
  try {
    return await terminalService.changeWorkingDirectory(pid, newCwd);
  } catch (error) {
    console.error('Failed to change working directory:', error);
    return false;
  }
});

ipcMain.handle('terminal-get-title', async (event, pid: number) => {
  try {
    return await terminalService.getTerminalTitle(pid);
  } catch (error) {
    console.error('Failed to get terminal title:', error);
    return null;
  }
});

ipcMain.handle('terminal-set-title', async (event, pid: number, title: string) => {
  try {
    return await terminalService.setTerminalTitle(pid, title);
  } catch (error) {
    console.error('Failed to set terminal title:', error);
    return false;
  }
});

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

app.whenReady().then(() => {
  // Restore previous windows or create new one
  const lastActiveWindows = store.get('lastActiveWindows', []) as string[];
  const windowStates = store.get('windowStates', []) as WindowState[];
  
  if (configManager.get('window', 'restoreWindows') && lastActiveWindows.length > 0) {
    // Restore all previously open windows
    lastActiveWindows.forEach(projectPath => {
      const windowState = windowStates.find(ws => ws.projectPath === projectPath);
      createWindow(projectPath, windowState);
    });
  } else {
    // Create a single new window
    createWindow();
  }
  
  createMenu();
  updateRecentProjectsMenu();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  saveOpenWindows();
});

// AI Configuration IPC handlers
import { AIConfigService } from './aiConfigService';

const aiConfigService = AIConfigService.getInstance();

// Set up AI config event listeners - use ConfigManager
aiConfigService.on('api-key-store', (serviceId: string, encryptedKey: string) => {
  const currentServices = configManager.get('ai', 'services') || {};
  currentServices[serviceId] = {
    ...currentServices[serviceId],
    encryptedApiKey: encryptedKey
  };
  configManager.set('ai', 'services', currentServices);
});

aiConfigService.on('api-key-remove', (serviceId: string) => {
  const currentServices = configManager.get('ai', 'services') || {};
  if (currentServices[serviceId]) {
    delete currentServices[serviceId].encryptedApiKey;
    configManager.set('ai', 'services', currentServices);
  }
});

aiConfigService.on('service-enabled', (serviceId: string, enabled: boolean) => {
  const currentServices = configManager.get('ai', 'services') || {};
  currentServices[serviceId] = {
    ...currentServices[serviceId],
    enabled: enabled
  };
  configManager.set('ai', 'services', currentServices);
});

aiConfigService.on('configuration-reset', () => {
  configManager.set('ai', 'services', {});
});

// AI Configuration IPC handlers
ipcMain.handle('ai-is-master-key-setup', async () => {
  return await aiConfigService.isMasterKeySetup();
});

ipcMain.handle('ai-setup-master-key', async (event, masterKey: string) => {
  try {
    await aiConfigService.setupMasterKey(masterKey);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-generate-master-key', async () => {
  return aiConfigService.generateMasterKey();
});

ipcMain.handle('ai-get-supported-services', async () => {
  return aiConfigService.getSupportedServices();
});

ipcMain.handle('ai-get-service-config', async (event, serviceId: string) => {
  const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
  const centralizedService = CentralizedAPIKeyService.getInstance();
  
  const providerConfig = centralizedService.getProviderConfig(serviceId);
  const hasApiKey = await centralizedService.isProviderConfigured(serviceId);
  
  return {
    id: serviceId,
    enabled: providerConfig?.enabled || false,
    hasApiKey
  };
});

ipcMain.handle('ai-store-api-key', async (event, serviceId: string, apiKey: string) => {
  try {
    const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
    const centralizedService = CentralizedAPIKeyService.getInstance();
    
    await centralizedService.setAPIKey(serviceId, apiKey);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-get-api-key', async (event, serviceId: string) => {
  try {
    const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
    const centralizedService = CentralizedAPIKeyService.getInstance();
    
    const apiKey = await centralizedService.getAPIKey(serviceId);
    return { success: true, apiKey };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-remove-api-key', async (event, serviceId: string) => {
  try {
    const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
    const centralizedService = CentralizedAPIKeyService.getInstance();
    
    await centralizedService.removeAPIKey(serviceId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-set-service-enabled', async (event, serviceId: string, enabled: boolean) => {
  try {
    await aiConfigService.setServiceEnabled(serviceId, enabled);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-validate-api-key', async (event, serviceId: string, apiKey: string) => {
  const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
  const centralizedService = CentralizedAPIKeyService.getInstance();
  
  return centralizedService.validateAPIKey(serviceId, apiKey);
});

ipcMain.handle('ai-test-api-key', async (event, serviceId: string, apiKey: string) => {
  const { CentralizedAPIKeyService } = require('../services/centralized-api-key-service');
  const centralizedService = CentralizedAPIKeyService.getInstance();
  
  return await centralizedService.testConnection(serviceId);
});

ipcMain.handle('ai-reset-configuration', async () => {
  return aiConfigService.resetConfiguration();
});

ipcMain.handle('ai-check-service-online', async (event, serviceId: string) => {
  return aiConfigService.checkServiceOnlineStatus(serviceId);
});

ipcMain.handle('ai-check-all-services-online', async () => {
  return aiConfigService.checkAllServicesOnlineStatus();
});

ipcMain.handle('ai-get-providers', async (): Promise<AIProviderConfig[]> => {
  const providerManager = getAIProviderManager();
  // Return only the serializable config objects for each provider
  return providerManager.getProviders().map((p) => p.config);
});

ipcMain.handle('ai-get-models', async (event, providerId: string): Promise<AIModel[]> => {
  const providerManager = getAIProviderManager();
  const provider = providerManager.getProvider(providerId);
  if (provider) {
    return provider.getModels();
  }
  return [];
});

// Claude CLI detection and execution handlers removed

ipcMain.handle('ai-get-available-providers', async (): Promise<AIProviderConfig[]> => {
  const providerManager = getAIProviderManager();
  const availableProviders = await providerManager.getAvailableProviders();
  return availableProviders.map((p) => p.config);
});

// Window management IPC handlers
ipcMain.on('focus-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    // Focus the window and bring it to front
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
    window.show();
  }
});

// Kanban IPC handlers
import { KanbanStorageService } from './kanban-storage-service';

ipcMain.handle('kanban:getBoard', async (event, projectPath: string, boardId: string) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    return await storage.getBoard(boardId);
  } catch (error) {
    console.error('[IPC] kanban:getBoard error:', error);
    return null;
  }
});

ipcMain.handle('kanban:saveBoard', async (event, projectPath: string, board: any) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    await storage.saveBoard(board);
    return { success: true };
  } catch (error) {
    console.error('[IPC] kanban:saveBoard error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('kanban:getTasks', async (event, projectPath: string, boardId: string) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    const tasks = await storage.getTasks(boardId);
  
  // Check for branches for each task
  for (const task of tasks) {
    if (task.id && projectPath) {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync('git branch -a', { cwd: projectPath });
        const branches = stdout.split('\n').map((b: string) => b.trim());
        task.hasBranch = branches.some((branch: string) => branch.includes(task.id));
      } catch {
        task.hasBranch = false;
      }
    }
  }
  
  return tasks;
  } catch (error) {
    console.error('[IPC] kanban:getTasks error:', error);
    return [];
  }
});

ipcMain.handle('kanban:updateTask', async (event, projectPath: string, boardId: string, task: any) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    await storage.updateTask(boardId, task);
    return { success: true };
  } catch (error) {
    console.error('[IPC] kanban:updateTask error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('kanban:deleteTask', async (event, projectPath: string, boardId: string, taskId: string) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    await storage.deleteTask(boardId, taskId);
    return { success: true };
  } catch (error) {
    console.error('[IPC] kanban:deleteTask error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('kanban:getEpics', async (event, projectPath: string, boardId: string) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    return await storage.getEpics(boardId);
  } catch (error) {
    console.error('[IPC] kanban:getEpics error:', error);
    return [];
  }
});

ipcMain.handle('kanban:updateEpic', async (event, projectPath: string, boardId: string, epic: any) => {
  try {
    const storage = new KanbanStorageService(projectPath);
    await storage.updateEpic(boardId, epic);
    return { success: true };
  } catch (error) {
    console.error('[IPC] kanban:updateEpic error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('kanban:checkBranches', async (event, projectPath: string) => {
  if (!projectPath) {
    console.error('[IPC] kanban:checkBranches - no project path provided');
    return [];
  }
  
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: projectPath });
    return stdout.split('\n')
      .map((b: string) => b.trim())
      .filter((b: string) => b.length > 0);
  } catch {
    return [];
  }
});

// Dexy Vectorization IPC handlers
import { registerDexyHandlers, setDexyProjectPath } from './dexy-ipc-handlers';
console.log('[MAIN] Registering Dexy handlers...');
registerDexyHandlers();

// MCP server is now started when projects are opened

// TODO Scanning IPC handlers
import { setupTodoIpcHandlers } from './todo-ipc-handlers';
import { todoAutoScanner } from '../services/todo-auto-scanner';
console.log('[MAIN] Registering TODO handlers...');
setupTodoIpcHandlers();
console.log('[MAIN] TODO handlers registered successfully');

// Chat History IPC handlers
ipcMain.handle('chat-history-save', async (event, projectPath: string, messages: any[]) => {
  try {
    await chatHistoryManager.saveChatHistory(projectPath, messages);
    return { success: true };
  } catch (error) {
    console.error('Failed to save chat history:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('chat-history-load', async (event, projectPath: string) => {
  try {
    const messages = await chatHistoryManager.loadChatHistory(projectPath);
    return { success: true, messages };
  } catch (error) {
    console.error('Failed to load chat history:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', messages: [] };
  }
});

ipcMain.handle('chat-history-clear', async (event, projectPath: string) => {
  try {
    await chatHistoryManager.clearChatHistory(projectPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to clear chat history:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('chat-history-cleanup', async (event, projectPath: string, maxAge?: number) => {
  try {
    await chatHistoryManager.cleanupOldHistories(projectPath, maxAge);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup chat history:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});