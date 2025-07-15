/**
 * IPC Handlers for MCP Integration
 * Bridges the MCP server with the renderer process
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { commandApprovalManager } from './command-approval';

const execAsync = promisify(exec);

export function setupMcpIpcHandlers(workspaceRoot: string | null): void {
  // Handle MCP tool calls from renderer process
  ipcMain.handle('mcp:callTool', async (event, toolName: string, args: any) => {
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
  const { path: dirPath = '.' } = args;
  
  // Validate path
  const absolutePath = path.resolve(workspaceRoot, dirPath);
  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt detected');
  }

  try {
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
  } catch (error: any) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
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
  ipcMain.removeHandler('mcp:callTool');
  ipcMain.removeHandler('mcp:requestCommandApproval');
  ipcMain.removeHandler('mcp:getAllowedCommands');
}