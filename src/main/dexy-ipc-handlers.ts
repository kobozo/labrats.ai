import { ipcMain } from 'electron';
import { DexyVectorizationService } from './dexy-vectorization-service';
import { VectorStorageService } from './vector-storage-service';
import { Task } from '../types/kanban';

let currentProjectPath: string | null = null;
let dexyService: DexyVectorizationService | null = null;
let vectorStorage: VectorStorageService | null = null;

export function setDexyProjectPath(projectPath: string | null) {
  currentProjectPath = projectPath;
  if (projectPath) {
    initializeDexyService(projectPath);
  }
}

async function initializeDexyService(projectPath: string) {
  try {
    console.log('[DEXY-IPC] Starting initialization for project:', projectPath);
    dexyService = DexyVectorizationService.getInstance();
    await dexyService.initialize(projectPath);
    
    vectorStorage = new VectorStorageService(projectPath);
    
    const isReady = dexyService.isReady();
    const config = dexyService.getConfig();
    
    console.log('[DEXY-IPC] Initialized for project:', projectPath);
    console.log('[DEXY-IPC] Service ready:', isReady);
    console.log('[DEXY-IPC] Service config:', config);
  } catch (error) {
    console.error('[DEXY-IPC] Failed to initialize:', error);
  }
}

export function registerDexyHandlers() {
  // Initialize Dexy service
  ipcMain.handle('dexy:initialize', async (_, projectPath: string) => {
    try {
      await initializeDexyService(projectPath);
      return { success: true };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to initialize:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Check if Dexy is configured and ready
  ipcMain.handle('dexy:isReady', async () => {
    const isReady = dexyService?.isReady() || false;
    console.log('[DEXY-IPC] isReady check:', {
      hasDexyService: !!dexyService,
      isReady,
      config: dexyService?.getConfig()
    });
    return isReady;
  });

  // Get Dexy configuration
  ipcMain.handle('dexy:getConfig', async () => {
    const config = dexyService?.getConfig() || null;
    console.log('[DEXY-IPC] getConfig:', config);
    return config;
  });

  // Vectorize a task
  ipcMain.handle('dexy:vectorizeTask', async (_, { task, boardId }: { task: Task; boardId: string }) => {
    try {
      if (!dexyService) {
        throw new Error('Dexy service not initialized');
      }
      
      await dexyService.vectorizeTask(task, boardId);
      return { success: true };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to vectorize task:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Update task vector
  ipcMain.handle('dexy:updateTaskVector', async (_, { task, boardId }: { task: Task; boardId: string }) => {
    try {
      if (!dexyService) {
        throw new Error('Dexy service not initialized');
      }
      
      await dexyService.updateTaskVector(task, boardId);
      return { success: true };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to update task vector:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Delete task vector
  ipcMain.handle('dexy:deleteTaskVector', async (_, taskId: string) => {
    try {
      if (!dexyService) {
        throw new Error('Dexy service not initialized');
      }
      
      await dexyService.deleteTaskVector(taskId);
      return { success: true };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to delete task vector:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Find similar tasks
  ipcMain.handle('dexy:findSimilarTasks', async (_, { task, options }: { 
    task: Task; 
    options?: { topK?: number; threshold?: number; excludeTaskId?: string } 
  }) => {
    try {
      if (!dexyService) {
        throw new Error('Dexy service not initialized');
      }
      
      const results = await dexyService.findSimilarTasks(task, options || {});
      return { success: true, results };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to find similar tasks:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', results: [] };
    }
  });

  // Get all vector indices
  ipcMain.handle('dexy:getIndices', async () => {
    try {
      if (!vectorStorage) {
        return { success: true, indices: [] };
      }
      
      const indices = vectorStorage.getAllIndices();
      return { success: true, indices };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to get indices:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', indices: [] };
    }
  });
  
  // Sync tasks
  ipcMain.handle('dexy:syncTasks', async (_, { tasks, boardId }: { tasks: Task[]; boardId: string }) => {
    try {
      console.log('[DEXY-IPC] Received sync request for', tasks.length, 'tasks, boardId:', boardId);
      
      if (!dexyService) {
        console.error('[DEXY-IPC] Dexy service not initialized');
        throw new Error('Dexy service not initialized');
      }
      
      await dexyService.syncTasks(tasks, boardId);
      console.log('[DEXY-IPC] Sync completed successfully');
      return { success: true };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to sync tasks:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // Check if task has vector
  ipcMain.handle('dexy:hasTaskVector', async (_, taskId: string) => {
    try {
      if (!dexyService) {
        throw new Error('Dexy service not initialized');
      }
      
      const hasVector = await dexyService.hasTaskVector(taskId);
      return { success: true, hasVector };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to check task vector:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', hasVector: false };
    }
  });
  
  // Get vectorized task IDs
  ipcMain.handle('dexy:getVectorizedTaskIds', async () => {
    try {
      console.log('[DEXY-IPC] Getting vectorized task IDs...');
      
      if (!dexyService) {
        console.warn('[DEXY-IPC] Dexy service not initialized');
        throw new Error('Dexy service not initialized');
      }
      
      const taskIds = await dexyService.getVectorizedTaskIds();
      console.log('[DEXY-IPC] Retrieved task IDs:', taskIds);
      
      return { success: true, taskIds };
    } catch (error) {
      console.error('[DEXY-IPC] Failed to get vectorized task IDs:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', taskIds: [] };
    }
  });
}