import { ipcMain } from 'electron';
import { todoScannerService } from '../services/todo-scanner-service';
import { todoTaskManager } from '../services/todo-task-manager';
import { KanbanStorageService } from './kanban-storage-service';

export function setupTodoIpcHandlers() {
  console.log('[TODO-IPC] Setting up TODO scanning IPC handlers');

  // Scan project for TODOs
  ipcMain.handle('todo-scan-project', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Scanning project for TODOs:', projectPath);
    
    try {
      const scanResult = await todoScannerService.scanProject(projectPath);
      console.log('[TODO-IPC] Scan completed:', scanResult.todos.length, 'TODOs found');
      return { success: true, data: scanResult };
    } catch (error) {
      console.error('[TODO-IPC] Error scanning project:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Scan for new TODOs since last scan
  ipcMain.handle('todo-scan-new', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Scanning for new TODOs:', projectPath);
    
    try {
      // Get existing mappings to identify already processed TODOs
      const mappings = await todoTaskManager.getMappings(projectPath);
      const existingTodos = mappings.map(m => ({ id: m.todoId }));
      
      // Scan for new TODOs
      const newTodos = await todoScannerService.scanForNewTodos(projectPath, existingTodos as any[]);
      
      console.log('[TODO-IPC] Found', newTodos.length, 'new TODOs');
      return { success: true, data: newTodos };
    } catch (error) {
      console.error('[TODO-IPC] Error scanning for new TODOs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Validate if a TODO still exists
  ipcMain.handle('todo-validate', async (event, todoId: string, projectPath: string) => {
    console.log('[TODO-IPC] Validating TODO:', todoId);
    
    try {
      const mapping = await todoTaskManager.getMappingByTodoId(todoId, projectPath);
      if (!mapping) {
        return { success: false, error: 'TODO mapping not found' };
      }

      // Create a basic TODO item from mapping for validation
      const todoItem = {
        id: mapping.todoId,
        filePath: mapping.filePath,
        lineNumber: mapping.lineNumber,
        content: '', // We'll validate based on line content
        type: 'TODO' as const,
        createdAt: mapping.createdAt,
        lastModified: mapping.lastSynced
      };

      const isValid = await todoScannerService.validateTodo(todoItem, projectPath);
      
      // Update mapping validity
      await todoTaskManager.updateMappingValidity(todoId, isValid, projectPath);
      
      console.log('[TODO-IPC] TODO validation result:', todoId, isValid);
      return { success: true, data: { isValid } };
    } catch (error) {
      console.error('[TODO-IPC] Error validating TODO:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get TODO statistics
  ipcMain.handle('todo-get-stats', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Getting TODO statistics:', projectPath);
    
    try {
      const scanResult = await todoScannerService.scanProject(projectPath);
      const stats = todoScannerService.getTodoStats(scanResult.todos);
      const taskManagerStats = await todoTaskManager.getStats(projectPath);
      
      // Get completed TODO tasks to adjust the total count
      const kanbanStorage = new KanbanStorageService(projectPath);
      const allTasks = await kanbanStorage.getTasks('main-board');
      const completedTodoTasks = allTasks.filter(task => 
        task.type === 'todo' && 
        task.todoId && 
        task.status === 'done'
      );
      
      // Adjust total count by excluding completed tasks
      const adjustedStats = {
        ...stats,
        total: Math.max(0, stats.total - completedTodoTasks.length), // Ensure non-negative
        validMappings: taskManagerStats.validMappings, // Use task manager's count (already excludes completed)
        totalMappings: taskManagerStats.totalMappings, // Use task manager's count (already excludes completed)
        tasksByType: taskManagerStats.tasksByType, // Use task manager's count (already excludes completed)
        tasksByPriority: taskManagerStats.tasksByPriority, // Use task manager's count (already excludes completed)
        scannedFiles: scanResult.scannedFiles,
        totalFiles: scanResult.totalFiles,
        errors: scanResult.errors,
        lastScan: taskManagerStats.lastScan,
        invalidMappings: taskManagerStats.invalidMappings
      };
      
      console.log('[TODO-IPC] TODO statistics (adjusted for completed tasks):', adjustedStats);
      return { success: true, data: adjustedStats };
    } catch (error) {
      console.error('[TODO-IPC] Error getting TODO stats:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Create tasks from TODOs
  ipcMain.handle('todo-create-tasks', async (event, projectPath: string, todoIds?: string[]) => {
    console.log('[TODO-IPC] Creating tasks from TODOs:', projectPath, todoIds);
    
    try {
      // Get all TODOs or filter by IDs
      const scanResult = await todoScannerService.scanProject(projectPath);
      let todosToProcess = scanResult.todos;
      
      if (todoIds && todoIds.length > 0) {
        todosToProcess = scanResult.todos.filter(todo => todoIds.includes(todo.id));
      }
      
      // Create tasks from TODOs
      const createdTasks = await todoTaskManager.createTasksFromTodos(todosToProcess, projectPath);
      
      console.log('[TODO-IPC] Created', createdTasks.length, 'tasks from TODOs');
      return { success: true, data: { tasks: createdTasks, count: createdTasks.length } };
    } catch (error) {
      console.error('[TODO-IPC] Error creating tasks from TODOs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get TODO-task mappings
  ipcMain.handle('todo-get-mappings', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Getting TODO-task mappings:', projectPath);
    
    try {
      const mappings = await todoTaskManager.getMappings(projectPath);
      console.log('[TODO-IPC] Found', mappings.length, 'mappings');
      return { success: true, data: mappings };
    } catch (error) {
      console.error('[TODO-IPC] Error getting mappings:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get TODO-task mapping by TODO ID
  ipcMain.handle('todo-get-mapping-by-todo', async (event, todoId: string, projectPath: string) => {
    console.log('[TODO-IPC] Getting mapping by TODO ID:', todoId);
    
    try {
      const mapping = await todoTaskManager.getMappingByTodoId(todoId, projectPath);
      return { success: true, data: mapping };
    } catch (error) {
      console.error('[TODO-IPC] Error getting mapping by TODO ID:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get TODO-task mapping by task ID
  ipcMain.handle('todo-get-mapping-by-task', async (event, taskId: string, projectPath: string) => {
    console.log('[TODO-IPC] Getting mapping by task ID:', taskId);
    
    try {
      const mapping = await todoTaskManager.getMappingByTaskId(taskId, projectPath);
      return { success: true, data: mapping };
    } catch (error) {
      console.error('[TODO-IPC] Error getting mapping by task ID:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Remove TODO-task mapping
  ipcMain.handle('todo-remove-mapping', async (event, todoId: string, projectPath: string) => {
    console.log('[TODO-IPC] Removing mapping:', todoId);
    
    try {
      await todoTaskManager.removeMapping(todoId, projectPath);
      console.log('[TODO-IPC] Mapping removed successfully');
      return { success: true };
    } catch (error) {
      console.error('[TODO-IPC] Error removing mapping:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get TODO task settings
  ipcMain.handle('todo-get-settings', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Getting TODO task settings:', projectPath);
    
    try {
      const settings = await todoTaskManager.getSettings(projectPath);
      return { success: true, data: settings };
    } catch (error) {
      console.error('[TODO-IPC] Error getting settings:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Update TODO task settings
  ipcMain.handle('todo-update-settings', async (event, projectPath: string, settings: any) => {
    console.log('[TODO-IPC] Updating TODO task settings:', projectPath, settings);
    
    try {
      await todoTaskManager.updateSettings(projectPath, settings);
      console.log('[TODO-IPC] Settings updated successfully');
      return { success: true };
    } catch (error) {
      console.error('[TODO-IPC] Error updating settings:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Clean up invalid mappings
  ipcMain.handle('todo-cleanup-invalid', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Cleaning up invalid mappings:', projectPath);
    
    try {
      const removedCount = await todoTaskManager.cleanupInvalidMappings(projectPath);
      console.log('[TODO-IPC] Cleaned up', removedCount, 'invalid mappings');
      return { success: true, data: { removedCount } };
    } catch (error) {
      console.error('[TODO-IPC] Error cleaning up invalid mappings:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Sync TODOs with tasks (scan for new TODOs and create tasks)
  ipcMain.handle('todo-sync', async (event, projectPath: string) => {
    console.log('[TODO-IPC] Syncing TODOs with tasks:', projectPath);
    
    try {
      // Get settings to check if auto-creation is enabled
      const settings = await todoTaskManager.getSettings(projectPath);
      if (!settings.createTasks) {
        console.log('[TODO-IPC] Auto-creation disabled, skipping sync');
        return { success: true, data: { skipped: true, reason: 'Auto-creation disabled' } };
      }

      // Get existing tasks from board to find already processed TODOs
      const kanbanStorage = new KanbanStorageService(projectPath);
      const existingTasks = await kanbanStorage.getTasks('main-board');
      const existingTodoIds = existingTasks
        .filter(task => task.todoId)
        .map(task => ({ id: task.todoId }));
      
      // Scan for new TODOs
      const newTodos = await todoScannerService.scanForNewTodos(projectPath, existingTodoIds as any[]);
      
      // Create tasks from new TODOs
      const createdTasks = await todoTaskManager.createTasksFromTodos(newTodos, projectPath);
      
      console.log('[TODO-IPC] Sync completed:', createdTasks.length, 'new tasks created');
      return { 
        success: true, 
        data: { 
          newTodos: newTodos.length, 
          createdTasks: createdTasks.length,
          tasks: createdTasks
        } 
      };
    } catch (error) {
      console.error('[TODO-IPC] Error syncing TODOs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  console.log('[TODO-IPC] TODO scanning IPC handlers setup complete');
}