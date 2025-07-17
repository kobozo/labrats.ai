/**
 * IPC Handlers for MCP Integration
 * Bridges the MCP server with the renderer process
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { commandApprovalManager } from './command-approval';
import { getProjectPathService } from '../../services/project-path-service';
// Code vectorization tool imports for main process
import { executeCodeSearchTool } from './tools/code-search-tool-main';
import { executeFindSimilarCodeTool } from './tools/find-similar-code-tool-main';
import { executeCodeExplorerTool } from './tools/code-explorer-tool-main';
import { executeCodeVectorizationStatusTool } from './tools/code-vectorization-status-tool-main';
import { executeFileSearchTool } from './tools/file-search-tool-main';
import { executeInFileSearchTool } from './tools/infile-search-tool-main';
import { executeReplaceTextTool } from './tools/replace-text-tool-main';
import { executeReadCodeElementTool } from './tools/read-code-element-tool-main';
import { executeSearchWithContextTool } from './tools/search-with-context-tool-main';
import { handleDependencyQuery } from './tools/dependency-query';
import { handleDependencyPath } from './tools/dependency-path';
import { handleDependencyStats } from './tools/dependency-stats';
import { handleDependencyImpact } from './tools/dependency-impact';
import { handleCircularDependencies } from './tools/circular-dependencies';

// Declare global to access windowProjects from main.ts
declare global {
  var windowProjects: Map<number, string>;
}

const execAsync = promisify(exec);

// Track if handlers are already set up
let handlersRegistered = false;
let currentWorkspaceRoot: string | null = null;

export function setupMcpIpcHandlers(workspaceRoot: string | null): void {
  // Update the workspace root
  currentWorkspaceRoot = workspaceRoot;
  console.log('[MCP-IPC] Setup called with workspace root:', workspaceRoot);
  
  // Update the ProjectPathService if we have a valid workspace root
  if (workspaceRoot) {
    const projectPathService = getProjectPathService();
    projectPathService.setProjectPath(workspaceRoot);
    console.log('[MCP-IPC] Updated ProjectPathService with workspace root:', workspaceRoot);
  }
  
  // Only register handlers once
  if (handlersRegistered) {
    console.log('[MCP-IPC] Handlers already registered, updating workspace root to:', workspaceRoot);
    return;
  }
  
  handlersRegistered = true;
  console.log('[MCP-IPC] Registering MCP IPC handlers');
  
  // Handle MCP tool calls from renderer process
  ipcMain.handle('mcp:callTool', async (event, toolName: string, args: any) => {
    console.log(`[MCP-IPC] Tool call: ${toolName}, current workspace root:`, currentWorkspaceRoot);
    
    // Try to get workspace root from multiple sources
    let workspaceRoot = currentWorkspaceRoot;
    
    if (!workspaceRoot) {
      // Try ProjectPathService first
      const projectPathService = getProjectPathService();
      workspaceRoot = projectPathService.getProjectPath();
      
      if (workspaceRoot) {
        console.log(`[MCP-IPC] Retrieved workspace root from ProjectPathService:`, workspaceRoot);
      } else {
        // Try window lookup
        const window = BrowserWindow.fromWebContents(event.sender);
        console.log(`[MCP-IPC] Looking up workspace for window:`, window?.id);
        
        if (window) {
          const windowProjects = global.windowProjects as Map<number, string>;
          console.log(`[MCP-IPC] Global windowProjects exists:`, !!windowProjects);
          console.log(`[MCP-IPC] Window projects map size:`, windowProjects?.size);
          console.log(`[MCP-IPC] Window projects entries:`, windowProjects ? Array.from(windowProjects.entries()) : 'none');
          
          if (windowProjects) {
            const projectPath = windowProjects.get(window.id);
            console.log(`[MCP-IPC] Project path for window ${window.id}:`, projectPath);
            
            if (projectPath) {
              workspaceRoot = projectPath;
              // Update both local cache and ProjectPathService
              currentWorkspaceRoot = workspaceRoot;
              projectPathService.setProjectPath(workspaceRoot);
              console.log(`[MCP-IPC] Retrieved workspace root from window:`, workspaceRoot);
            }
          }
        } else {
          console.log(`[MCP-IPC] Could not get window from event.sender`);
        }
      }
    }
    
    // If still no workspace root, try to get it from the current working directory
    if (!workspaceRoot) {
      const cwd = process.cwd();
      console.log(`[MCP-IPC] Trying to use current working directory:`, cwd);
      
      // Check if current directory looks like a valid project
      if (cwd && cwd !== '/' && cwd !== os.homedir()) {
        workspaceRoot = cwd;
        currentWorkspaceRoot = workspaceRoot;
        const projectPathService = getProjectPathService();
        projectPathService.setProjectPath(workspaceRoot);
        console.log(`[MCP-IPC] Using current working directory as workspace root:`, workspaceRoot);
      }
    }
    
    if (!workspaceRoot) {
      throw new Error('No workspace root set');
    }

    console.log(`[MCP-IPC] Tool call: ${toolName}`, args);

    try {
      switch (toolName) {
        case 'listFiles':
          return await handleListFiles(workspaceRoot, args);
        case 'readFile':
          return await handleReadFile(workspaceRoot, args);
        case 'replaceText':
          return await handleReplaceText(workspaceRoot, args);
        case 'execCommand':
          return await handleExecCommand(workspaceRoot, args);
        case 'search_code':
          return await executeCodeSearchTool(args);
        case 'find_similar_code':
          return await executeFindSimilarCodeTool(args);
        case 'explore_codebase':
          return await executeCodeExplorerTool(args);
        case 'code_vectorization_status':
          return await executeCodeVectorizationStatusTool(args);
        case 'search_files':
          return await executeFileSearchTool(args);
        case 'search_in_files':
          return await executeInFileSearchTool(args);
        case 'replace_in_file':
          return await executeReplaceTextTool(args);
        case 'read_code_element':
          return await executeReadCodeElementTool(args);
        case 'search_with_context':
          return await executeSearchWithContextTool(args);
        case 'dependency_query':
          return await handleDependencyQuery(args);
        case 'dependency_path':
          return await handleDependencyPath(args);
        case 'dependency_stats':
          return await handleDependencyStats(args);
        case 'dependency_impact':
          return await handleDependencyImpact(args);
        case 'circular_dependencies':
          return await handleCircularDependencies(args);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      console.error(`[MCP-IPC] Tool error:`, error);
      throw error;
    }
  });

  // Handle command approval requests
  ipcMain.handle('mcp:requestCommandApproval', async (event, cmd: string, cwd: string) => {
    return await commandApprovalManager.requestApproval(cmd, cwd);
  });

  // Get allowed commands
  ipcMain.handle('mcp:getAllowedCommands', async () => {
    return commandApprovalManager.getAllowedCommands();
  });
}

async function handleListFiles(workspaceRoot: string, args: any): Promise<string> {
  const { path: dirPath = '.', recursive = false } = args;
  
  // Validate path
  const absolutePath = path.resolve(workspaceRoot, dirPath);
  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  try {
    if (recursive) {
      // Recursive listing
      const allEntries = await listFilesRecursively(absolutePath, workspaceRoot, dirPath);
      return JSON.stringify({
        path: dirPath,
        entries: allEntries,
        total_count: allEntries.length,
        recursive: true,
      });
    } else {
      // Non-recursive listing (existing logic)
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      
      const files: any[] = [];
      const directories: any[] = [];
      
      for (const entry of entries) {
        // Skip hidden files and common ignore patterns
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        const item = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        };
        
        if (entry.isDirectory()) {
          directories.push(item);
        } else {
          files.push(item);
        }
      }
      
      // Sort directories first, then files
      const allEntries = [...directories.sort((a, b) => a.name.localeCompare(b.name)), 
                          ...files.sort((a, b) => a.name.localeCompare(b.name))];
      
      return JSON.stringify({
        path: dirPath,
        entries: allEntries,
        total_count: allEntries.length,
      });
    }
  } catch (error: any) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

async function listFilesRecursively(
  absolutePath: string, 
  workspaceRoot: string, 
  relativePath: string,
  baseRelativePath: string = relativePath
): Promise<any[]> {
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const allEntries: any[] = [];
  
  for (const entry of entries) {
    // Skip hidden files and common ignore patterns
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    
    const entryAbsolutePath = path.join(absolutePath, entry.name);
    const entryRelativePath = path.join(relativePath, entry.name);
    
    // Calculate the path relative to the base directory
    const displayPath = path.relative(baseRelativePath, entryRelativePath);
    
    if (entry.isDirectory()) {
      allEntries.push({
        name: displayPath,
        type: 'directory',
        path: entryRelativePath,
      });
      
      // Recursively list files in subdirectory
      const subEntries = await listFilesRecursively(
        entryAbsolutePath, 
        workspaceRoot, 
        entryRelativePath,
        baseRelativePath
      );
      allEntries.push(...subEntries);
    } else {
      allEntries.push({
        name: displayPath,
        type: 'file',
        path: entryRelativePath,
      });
    }
  }
  
  return allEntries;
}

async function handleReadFile(workspaceRoot: string, args: any): Promise<string> {
  const { path: filePath, start = 0, end } = args;
  
  // Validate path
  const absolutePath = path.resolve(workspaceRoot, filePath);
  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  try {
    const content = await fs.readFile(absolutePath, 'utf8');
    const slicedContent = end ? content.slice(start, end) : content.slice(start);
    
    return JSON.stringify({
      path: filePath,
      content: slicedContent,
      totalSize: content.length,
    });
  } catch (error: any) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

async function handleReplaceText(workspaceRoot: string, args: any): Promise<string> {
  const { path: filePath, oldText, newText } = args;
  
  // Validate path
  const absolutePath = path.resolve(workspaceRoot, filePath);
  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  try {
    const content = await fs.readFile(absolutePath, 'utf8');
    const idx = content.indexOf(oldText);
    
    if (idx === -1) {
      throw new Error('Text not found in file');
    }

    const updated = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
    await fs.writeFile(absolutePath, updated, 'utf8');
    
    return JSON.stringify({
      path: filePath,
      replaced: true,
      position: idx,
      oldLength: oldText.length,
      newLength: newText.length,
    });
  } catch (error: any) {
    throw new Error(`Failed to replace text: ${error.message}`);
  }
}

async function handleExecCommand(workspaceRoot: string, args: any): Promise<string> {
  const { cmd, cwd: workingDir = '.', timeoutSec = 30 } = args;
  
  // Check if command is allowed
  if (!commandApprovalManager.isAllowed(cmd)) {
    // Request approval
    const approved = await commandApprovalManager.requestApproval(cmd, workingDir);
    if (!approved) {
      throw new Error('Command execution denied by user');
    }
  }

  // Validate working directory
  const absoluteCwd = path.resolve(workspaceRoot, workingDir);
  if (!absoluteCwd.startsWith(workspaceRoot)) {
    throw new Error('Working directory outside workspace');
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: absoluteCwd,
      timeout: timeoutSec * 1000,
    });

    return JSON.stringify({
      cmd,
      cwd: workingDir,
      stdout,
      stderr,
      exitCode: 0,
    });
  } catch (error: any) {
    return JSON.stringify({
      cmd,
      cwd: workingDir,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
    });
  }
}

// Clear handlers when workspace changes
export function clearMcpIpcHandlers(): void {
  if (handlersRegistered) {
    ipcMain.removeHandler('mcp:callTool');
    ipcMain.removeHandler('mcp:requestCommandApproval');
    ipcMain.removeHandler('mcp:getAllowedCommands');
    handlersRegistered = false;
    currentWorkspaceRoot = null;
    console.log('[MCP-IPC] MCP IPC handlers cleared');
  }
}