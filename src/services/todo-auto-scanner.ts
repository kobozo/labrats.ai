import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { todoScannerService } from './todo-scanner-service';
import { todoTaskManager } from './todo-task-manager';
import { KanbanStorageService } from '../main/kanban-storage-service';
// TODO: test branch-aware scanning implementation

export interface AutoScanConfig {
  enabled: boolean;
  debounceMs: number;
  scanOnProjectOpen: boolean;
  scanOnFileChange: boolean;
  includedExtensions: string[];
  excludedPaths: string[];
  allowedBranches?: string[]; // Branch-aware scanning
  autoCompleteInvalidTodos?: boolean; // Auto-complete TODOs that are no longer detected
}

export interface AutoScanStats {
  lastScan: string;
  totalScans: number;
  newTodosFound: number;
  tasksCreated: number;
  scanDuration: number;
  watchedFiles: number;
}

export class TodoAutoScanner {
  private static instance: TodoAutoScanner;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private currentProject: string | null = null;
  private isScanning = false;
  private stats: AutoScanStats = {
    lastScan: '',
    totalScans: 0,
    newTodosFound: 0,
    tasksCreated: 0,
    scanDuration: 0,
    watchedFiles: 0
  };

  private defaultConfig: AutoScanConfig = {
    enabled: true,
    debounceMs: 2000, // Wait 2 seconds after file changes before scanning
    scanOnProjectOpen: true,
    scanOnFileChange: true,
    includedExtensions: [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sh',
      '.css', '.scss', '.sass', '.less', '.html', '.xml', '.yml', '.yaml',
      '.json', '.md', '.sql', '.vue', '.svelte'
    ],
    excludedPaths: [
      'node_modules',
      'dist',
      'build',
      'out',
      '.git',
      'coverage',
      '.next',
      '.nuxt',
      'vendor',
      '__pycache__',
      '.pytest_cache',
      'target',
      'bin',
      'obj'
    ],
    allowedBranches: ['main', 'master', 'develop'], // Default allowed branches
    autoCompleteInvalidTodos: true // Auto-complete TODOs that are no longer detected
  };

  private constructor() {}

  /**
   * Get current git branch
   */
  private async getCurrentBranch(projectPath: string): Promise<string | null> {
    const execAsync = promisify(exec);
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
      return stdout.trim() || null;
    } catch (error) {
      console.warn('[TODO-AUTO-SCANNER] Failed to get current git branch:', error);
      return null;
    }
  }

  /**
   * Check if current branch is allowed for scanning
   */
  private async isBranchAllowed(projectPath: string, config: AutoScanConfig): Promise<boolean> {
    if (!config.allowedBranches || config.allowedBranches.length === 0) {
      return true; // If no branch restrictions, allow all branches
    }

    const currentBranch = await this.getCurrentBranch(projectPath);
    if (!currentBranch) {
      console.warn('[TODO-AUTO-SCANNER] Could not determine current branch, allowing scan');
      return true;
    }

    const isAllowed = config.allowedBranches.includes(currentBranch);
    if (!isAllowed) {
      console.log(`[TODO-AUTO-SCANNER] Current branch "${currentBranch}" is not in allowed branches:`, config.allowedBranches);
    }
    return isAllowed;
  }

  public static getInstance(): TodoAutoScanner {
    if (!TodoAutoScanner.instance) {
      TodoAutoScanner.instance = new TodoAutoScanner();
    }
    return TodoAutoScanner.instance;
  }

  /**
   * Start auto-scanning for a project
   */
  public async startScanning(projectPath: string): Promise<void> {
    console.log('[TODO-AUTO-SCANNER] Starting auto-scan for project:', projectPath);
    
    try {
      // Stop existing watchers
      this.stopScanning();
      
      this.currentProject = projectPath;
      
      // Load or create config
      const config = await this.loadConfig(projectPath);
      
      if (!config.enabled) {
        console.log('[TODO-AUTO-SCANNER] Auto-scanning disabled in config');
        return;
      }
      
      // File tracking is now handled by the code orchestrator service
      // to avoid circular dependencies
      
      // Initial scan if enabled
      if (config.scanOnProjectOpen) {
        await this.performScan();
      }
      
      // Set up file watchers if enabled
      if (config.scanOnFileChange) {
        await this.setupWatchers(projectPath, config);
      }
      
      console.log('[TODO-AUTO-SCANNER] Auto-scanning started successfully');
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Failed to start auto-scanning:', error);
    }
  }

  /**
   * Stop auto-scanning
   */
  public stopScanning(): void {
    console.log('[TODO-AUTO-SCANNER] Stopping auto-scanning');
    
    // Clear all watchers
    for (const [watchPath, watcher] of this.watchers) {
      try {
        watcher.close();
        console.log('[TODO-AUTO-SCANNER] Closed watcher for:', watchPath);
      } catch (error) {
        console.error('[TODO-AUTO-SCANNER] Error closing watcher for:', watchPath, error);
      }
    }
    this.watchers.clear();
    
    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    
    this.currentProject = null;
    console.log('[TODO-AUTO-SCANNER] Auto-scanning stopped');
  }

  /**
   * Setup file watchers for the project
   */
  private async setupWatchers(projectPath: string, config: AutoScanConfig): Promise<void> {
    console.log('[TODO-AUTO-SCANNER] Setting up file watchers');
    
    try {
      // Get all eligible files
      const files = await this.findWatchableFiles(projectPath, config);
      console.log('[TODO-AUTO-SCANNER] Found', files.length, 'files to watch');
      
      // Group files by directory to reduce the number of watchers
      const directories = new Set<string>();
      for (const file of files) {
        directories.add(path.dirname(file));
      }
      
      // Create watchers for each directory
      for (const dir of directories) {
        try {
          const watcher = fs.watch(dir, { recursive: false }, (eventType, filename) => {
            if (filename) {
              const fullPath = path.join(dir, filename);
              this.handleFileChange(fullPath, config);
            }
          });
          
          this.watchers.set(dir, watcher);
        } catch (error) {
          console.error('[TODO-AUTO-SCANNER] Failed to watch directory:', dir, error);
        }
      }
      
      this.stats.watchedFiles = files.length;
      console.log('[TODO-AUTO-SCANNER] Created', this.watchers.size, 'directory watchers');
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Failed to setup watchers:', error);
    }
  }

  /**
   * Handle file change events
   */
  private handleFileChange(filePath: string, config: AutoScanConfig): void {
    // Check if file is eligible for scanning
    if (!this.isFileEligible(filePath, config)) {
      return;
    }
    
    console.log('[TODO-AUTO-SCANNER] File changed:', filePath);
    
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new debounced timer
    const timer = setTimeout(() => {
      this.performScan();
      this.debounceTimers.delete(filePath);
    }, config.debounceMs);
    
    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Check if a file is eligible for TODO scanning
   */
  private isFileEligible(filePath: string, config: AutoScanConfig): boolean {
    const ext = path.extname(filePath).toLowerCase();
    
    // Check extension
    if (!config.includedExtensions.includes(ext)) {
      return false;
    }
    
    // Check excluded paths
    const relativePath = this.currentProject ? path.relative(this.currentProject, filePath) : filePath;
    for (const excludedPath of config.excludedPaths) {
      if (relativePath.includes(excludedPath)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Find all files that should be watched
   */
  private async findWatchableFiles(projectPath: string, config: AutoScanConfig): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Check if directory should be excluded
            const relativePath = path.relative(projectPath, fullPath);
            const shouldExclude = config.excludedPaths.some(excluded => 
              relativePath.includes(excluded) || entry.name === excluded
            );
            
            if (!shouldExclude) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            if (this.isFileEligible(fullPath, config)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error('[TODO-AUTO-SCANNER] Error scanning directory:', dir, error);
      }
    };
    
    await scanDirectory(projectPath);
    return files;
  }

  /**
   * Perform a TODO scan and create tasks
   */
  private async performScan(): Promise<void> {
    if (!this.currentProject || this.isScanning) {
      return;
    }
    
    console.log('[TODO-AUTO-SCANNER] Performing TODO scan');
    this.isScanning = true;
    const startTime = Date.now();
    
    try {
      // Load config to check branch restrictions
      const config = await this.loadConfig(this.currentProject);
      
      // Check if current branch is allowed for scanning
      const branchAllowed = await this.isBranchAllowed(this.currentProject, config);
      if (!branchAllowed) {
        console.log('[TODO-AUTO-SCANNER] Skipping scan - current branch not allowed');
        return;
      }
      
      // Get existing mappings to identify already processed TODOs
      const mappings = await todoTaskManager.getMappings(this.currentProject);
      const existingTodoIds = mappings.map(m => m.todoId);
      
      // Get all TODOs first, then filter out existing ones
      const scanResult = await todoScannerService.scanProject(this.currentProject);
      const newTodos = scanResult.todos.filter(todo => !existingTodoIds.includes(todo.id));
      
      // Auto-complete TODOs that are no longer detected
      if (config.autoCompleteInvalidTodos) {
        await this.autoCompleteMissingTodos(scanResult.todos, this.currentProject);
      }
      
      if (newTodos.length > 0) {
        console.log('[TODO-AUTO-SCANNER] Found', newTodos.length, 'new TODOs');
        
        // Create tasks from new TODOs
        const createdTasks = await todoTaskManager.createTasksFromTodos(newTodos, this.currentProject);
        
        // Update stats
        this.stats.newTodosFound += newTodos.length;
        this.stats.tasksCreated += createdTasks.length;
        
        console.log('[TODO-AUTO-SCANNER] Created', createdTasks.length, 'new tasks');
        
        // Emit event for UI updates
        this.emitScanComplete(newTodos.length, createdTasks.length);
      } else {
        console.log('[TODO-AUTO-SCANNER] No new TODOs found');
      }
      
      // Update stats
      const duration = Date.now() - startTime;
      this.stats.lastScan = new Date().toISOString();
      this.stats.totalScans++;
      this.stats.scanDuration = duration;
      
      console.log('[TODO-AUTO-SCANNER] Scan completed in', duration, 'ms');
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Error during scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Auto-complete TODOs that are no longer detected in the codebase
   */
  private async autoCompleteMissingTodos(currentTodos: { id: string }[], projectPath: string): Promise<void> {
    try {
      const kanbanStorage = new KanbanStorageService(projectPath);
      const allTasks = await kanbanStorage.getTasks('main-board');
      
      // Find all TODO tasks that are not in done status
      const todoTasks = allTasks.filter(task => 
        task.todoId && task.status !== 'done'
      );
      
      // Create set of currently detected TODO IDs
      const currentTodoIds = new Set(currentTodos.map(todo => todo.id));
      
      // Find tasks that correspond to TODOs that no longer exist
      const missingTodoTasks = todoTasks.filter(task => 
        task.todoId && !currentTodoIds.has(task.todoId)
      );
      
      if (missingTodoTasks.length > 0) {
        console.log(`[TODO-AUTO-SCANNER] Auto-completing ${missingTodoTasks.length} missing TODOs`);
        
        // Move missing TODO tasks to done status
        for (const task of missingTodoTasks) {
          const updatedTask = {
            ...task,
            status: 'done' as const,
            updatedAt: new Date().toISOString(),
            comments: [
              ...(task.comments || []),
              {
                id: `comment-${Date.now()}`,
                taskId: task.id,
                authorName: 'System',
                authorType: 'agent' as const,
                content: 'Auto-completed: TODO no longer detected in codebase',
                timestamp: new Date().toISOString()
              }
            ]
          };
          
          await kanbanStorage.updateTask('main-board', updatedTask);
          console.log(`[TODO-AUTO-SCANNER] Auto-completed task ${task.id} (TODO: ${task.todoId})`);
        }
      }
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Error auto-completing missing TODOs:', error);
    }
  }

  /**
   * Emit scan complete event for UI updates
   */
  private emitScanComplete(newTodos: number, newTasks: number): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('todo-auto-scan-complete', {
        detail: { newTodos, newTasks, timestamp: new Date().toISOString() }
      });
      window.dispatchEvent(event);
    }
  }

  /**
   * Load auto-scan configuration
   */
  private async loadConfig(projectPath: string): Promise<AutoScanConfig> {
    const configPath = path.join(projectPath, '.labrats', 'boards', 'auto-scan-config.json');
    
    try {
      if (fs.existsSync(configPath)) {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        const loadedConfig = JSON.parse(content) as Partial<AutoScanConfig>;
        return { ...this.defaultConfig, ...loadedConfig };
      }
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Error loading config:', error);
    }
    
    // Save default config
    await this.saveConfig(projectPath, this.defaultConfig);
    return this.defaultConfig;
  }

  /**
   * Save auto-scan configuration
   */
  private async saveConfig(projectPath: string, config: AutoScanConfig): Promise<void> {
    const configPath = path.join(projectPath, '.labrats', 'boards', 'auto-scan-config.json');
    
    try {
      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[TODO-AUTO-SCANNER] Config saved:', configPath);
    } catch (error) {
      console.error('[TODO-AUTO-SCANNER] Error saving config:', error);
    }
  }

  /**
   * Get auto-scan configuration
   */
  public async getConfig(): Promise<AutoScanConfig | null> {
    if (!this.currentProject) return null;
    return this.loadConfig(this.currentProject);
  }

  /**
   * Update auto-scan configuration
   */
  public async updateConfig(config: Partial<AutoScanConfig>): Promise<void> {
    if (!this.currentProject) return;
    
    const currentConfig = await this.loadConfig(this.currentProject);
    const newConfig = { ...currentConfig, ...config };
    
    await this.saveConfig(this.currentProject, newConfig);
    
    // Restart scanning with new config
    if (newConfig.enabled) {
      await this.startScanning(this.currentProject);
    } else {
      this.stopScanning();
    }
  }

  /**
   * Get auto-scan statistics
   */
  public getStats(): AutoScanStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      lastScan: '',
      totalScans: 0,
      newTodosFound: 0,
      tasksCreated: 0,
      scanDuration: 0,
      watchedFiles: 0
    };
  }

  /**
   * Manually trigger a scan
   */
  public async triggerScan(): Promise<void> {
    if (!this.currentProject) {
      throw new Error('No project set for scanning');
    }
    
    await this.performScan();
  }

  /**
   * Check if auto-scanning is active
   */
  public isActive(): boolean {
    return this.currentProject !== null && this.watchers.size > 0;
  }
}

export const todoAutoScanner = TodoAutoScanner.getInstance();