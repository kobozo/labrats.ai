import { Task } from '../types/kanban';

export interface DexyConfig {
  providerId: string;
  modelId: string;
}

export interface SimilarTask {
  task: Task;
  similarity: number;
}

class DexyServiceRenderer {
  private static instance: DexyServiceRenderer;
  private initialized = false;

  private constructor() {}

  static getInstance(): DexyServiceRenderer {
    if (!DexyServiceRenderer.instance) {
      DexyServiceRenderer.instance = new DexyServiceRenderer();
    }
    return DexyServiceRenderer.instance;
  }

  async initialize(projectPath: string): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.warn('[DEXY-RENDERER] ElectronAPI not available');
      return;
    }

    try {
      const result = await window.electronAPI.dexy!.initialize(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize Dexy');
      }
      this.initialized = true;
      console.log('[DEXY-RENDERER] Initialized successfully');
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to initialize:', error);
      throw error;
    }
  }

  async isReady(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.electronAPI?.dexy?.isReady) {
      return false;
    }

    try {
      return await window.electronAPI.dexy.isReady();
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to check if ready:', error);
      return false;
    }
  }

  async getConfig(): Promise<DexyConfig | null> {
    if (typeof window === 'undefined' || !window.electronAPI?.dexy?.getConfig) {
      return null;
    }

    try {
      return await window.electronAPI.dexy.getConfig();
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to get config:', error);
      return null;
    }
  }

  async vectorizeTask(task: Task, boardId: string): Promise<void> {
    if (!this.initialized || typeof window === 'undefined' || !window.electronAPI?.dexy?.vectorizeTask) {
      console.warn('[DEXY-RENDERER] Not initialized or API not available');
      return;
    }

    try {
      const result = await window.electronAPI.dexy.vectorizeTask({ task, boardId });
      if (!result.success) {
        throw new Error(result.error || 'Failed to vectorize task');
      }
      console.log('[DEXY-RENDERER] Task vectorized:', task.id);
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to vectorize task:', error);
    }
  }

  async updateTaskVector(task: Task, boardId: string): Promise<void> {
    if (!this.initialized || typeof window === 'undefined' || !window.electronAPI?.dexy?.updateTaskVector) {
      console.warn('[DEXY-RENDERER] Not initialized or API not available');
      return;
    }

    try {
      const result = await window.electronAPI.dexy.updateTaskVector({ task, boardId });
      if (!result.success) {
        throw new Error(result.error || 'Failed to update task vector');
      }
      console.log('[DEXY-RENDERER] Task vector updated:', task.id);
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to update task vector:', error);
    }
  }

  async deleteTaskVector(taskId: string): Promise<void> {
    if (!this.initialized || typeof window === 'undefined' || !window.electronAPI?.dexy?.deleteTaskVector) {
      console.warn('[DEXY-RENDERER] Not initialized or API not available');
      return;
    }

    try {
      const result = await window.electronAPI.dexy.deleteTaskVector(taskId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete task vector');
      }
      console.log('[DEXY-RENDERER] Task vector deleted:', taskId);
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to delete task vector:', error);
    }
  }

  async findSimilarTasks(
    task: Task, 
    options?: {
      topK?: number;
      threshold?: number;
      excludeTaskId?: string;
    }
  ): Promise<SimilarTask[]> {
    if (!this.initialized || typeof window === 'undefined' || !window.electronAPI?.dexy?.findSimilarTasks) {
      console.warn('[DEXY-RENDERER] Not initialized or API not available');
      return [];
    }

    try {
      const result = await window.electronAPI.dexy.findSimilarTasks({ task, options });
      if (!result.success) {
        console.error('[DEXY-RENDERER] Failed to find similar tasks:', result.error);
        return [];
      }
      return result.results || [];
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to find similar tasks:', error);
      return [];
    }
  }

  async getIndices(): Promise<any[]> {
    if (typeof window === 'undefined' || !window.electronAPI?.dexy?.getIndices) {
      return [];
    }

    try {
      const result = await window.electronAPI.dexy.getIndices();
      return result.indices || [];
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to get indices:', error);
      return [];
    }
  }

  async syncTasks(tasks: Task[], boardId: string): Promise<void> {
    if (!this.initialized || typeof window === 'undefined' || !window.electronAPI?.dexy?.syncTasks) {
      console.warn('[DEXY-RENDERER] Not initialized or API not available');
      return;
    }

    try {
      const result = await window.electronAPI.dexy.syncTasks({ tasks, boardId });
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync tasks');
      }
      console.log('[DEXY-RENDERER] Tasks synced successfully');
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to sync tasks:', error);
    }
  }

  async hasTaskVector(taskId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !window.electronAPI?.dexy?.hasTaskVector) {
      return false;
    }

    try {
      const result = await window.electronAPI.dexy.hasTaskVector(taskId);
      return result.hasVector || false;
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to check task vector:', error);
      return false;
    }
  }

  async getVectorizedTaskIds(): Promise<string[]> {
    if (typeof window === 'undefined' || !window.electronAPI?.dexy?.getVectorizedTaskIds) {
      return [];
    }

    try {
      const result = await window.electronAPI.dexy.getVectorizedTaskIds();
      return result.taskIds || [];
    } catch (error) {
      console.error('[DEXY-RENDERER] Failed to get vectorized task IDs:', error);
      return [];
    }
  }
}

// Export singleton instance
export const dexyService = DexyServiceRenderer.getInstance();