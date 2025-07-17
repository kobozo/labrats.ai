/**
 * Simple Kanban IPC Handlers
 * Handles communication between renderer and simple kanban service
 */

import { ipcMain, BrowserWindow } from 'electron';
import { simpleKanbanService } from '../services/simple-kanban-service';
import { simpleTodoScanner } from '../services/simple-todo-scanner';
import { SimpleTask, TaskStatus } from '../types/simple-kanban';

export function registerSimpleKanbanHandlers(projectPath: string): void {
  console.log('[KANBAN-IPC] Registering simple kanban handlers for:', projectPath);
  
  // Initialize services
  simpleKanbanService.initialize(projectPath).catch(console.error);
  simpleTodoScanner.initialize(projectPath).catch(console.error);
  
  // Forward service events to renderer
  simpleKanbanService.on('task-event', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('simple-kanban-event', event);
    });
  });
  
  simpleTodoScanner.on('scan-completed', (result) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('todo-scan-completed', result);
    });
  });
  
  // Board operations
  ipcMain.handle('simple-kanban:get-board', async () => {
    return simpleKanbanService.getBoard();
  });
  
  // Task CRUD operations
  ipcMain.handle('simple-kanban:create-task', async (_, task: Partial<SimpleTask>) => {
    return simpleKanbanService.createTask(task);
  });
  
  ipcMain.handle('simple-kanban:update-task', async (_, taskId: string, updates: Partial<SimpleTask>) => {
    return simpleKanbanService.updateTask(taskId, updates);
  });
  
  ipcMain.handle('simple-kanban:delete-task', async (_, taskId: string) => {
    return simpleKanbanService.deleteTask(taskId);
  });
  
  ipcMain.handle('simple-kanban:move-task', async (_, taskId: string, newStatus: TaskStatus) => {
    return simpleKanbanService.moveTask(taskId, newStatus);
  });
  
  ipcMain.handle('simple-kanban:add-comment', async (_, taskId: string, authorId: string, authorName: string, content: string) => {
    return simpleKanbanService.addComment(taskId, authorId, authorName, content);
  });
  
  // Query operations
  ipcMain.handle('simple-kanban:get-task', async (_, taskId: string) => {
    return simpleKanbanService.getTask(taskId);
  });
  
  ipcMain.handle('simple-kanban:get-tasks-by-status', async (_, status: TaskStatus) => {
    return simpleKanbanService.getTasksByStatus(status);
  });
  
  ipcMain.handle('simple-kanban:get-blocked-tasks', async () => {
    return simpleKanbanService.getBlockedTasks();
  });
  
  // TODO scanner operations
  ipcMain.handle('simple-todo:scan-project', async () => {
    return simpleTodoScanner.scanProject();
  });
  
  ipcMain.handle('simple-todo:scan-file', async (_, filePath: string) => {
    return simpleTodoScanner.scanSingleFile(filePath);
  });
}

export function unregisterSimpleKanbanHandlers(): void {
  console.log('[KANBAN-IPC] Unregistering simple kanban handlers');
  
  // Cleanup services
  simpleKanbanService.cleanup().catch(console.error);
  simpleTodoScanner.cleanup().catch(console.error);
  
  // Remove IPC handlers
  ipcMain.removeHandler('simple-kanban:get-board');
  ipcMain.removeHandler('simple-kanban:create-task');
  ipcMain.removeHandler('simple-kanban:update-task');
  ipcMain.removeHandler('simple-kanban:delete-task');
  ipcMain.removeHandler('simple-kanban:move-task');
  ipcMain.removeHandler('simple-kanban:add-comment');
  ipcMain.removeHandler('simple-kanban:get-task');
  ipcMain.removeHandler('simple-kanban:get-tasks-by-status');
  ipcMain.removeHandler('simple-kanban:get-blocked-tasks');
  ipcMain.removeHandler('simple-todo:scan-project');
  ipcMain.removeHandler('simple-todo:scan-file');
}