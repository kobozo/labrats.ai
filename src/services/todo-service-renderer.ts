import { TodoItem, TodoScanResult } from './todo-scanner-service';
import { TodoTaskMapping } from './todo-task-manager';
import { Task } from '../types/kanban';

export interface TodoServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TodoStats {
  total: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byAuthor: Record<string, number>;
  byFileExtension: Record<string, number>;
  totalMappings: number;
  validMappings: number;
  invalidMappings: number;
  lastScan: string;
  tasksByType: Record<string, number>;
  tasksByPriority: Record<string, number>;
  scannedFiles: number;
  totalFiles: number;
  errors: string[];
}

export interface TodoSyncResult {
  newTodos: number;
  createdTasks: number;
  tasks: Task[];
}

export interface TodoSettings {
  autoScan: boolean;
  createTasks: boolean;
  defaultPriority: 'low' | 'medium' | 'high';
  defaultAssignee: string;
  taskPrefix: string;
}

export class TodoServiceRenderer {
  private static instance: TodoServiceRenderer;
  private currentProject: string | null = null;

  private constructor() {}

  public static getInstance(): TodoServiceRenderer {
    if (!TodoServiceRenderer.instance) {
      TodoServiceRenderer.instance = new TodoServiceRenderer();
    }
    return TodoServiceRenderer.instance;
  }

  /**
   * Set the current project path
   */
  public setCurrentProject(projectPath: string | null): void {
    this.currentProject = projectPath;
    console.log('[TODO-SERVICE-RENDERER] Current project set to:', projectPath);
  }

  /**
   * Get the current project path
   */
  public getCurrentProject(): string | null {
    return this.currentProject;
  }

  /**
   * Scan the current project for TODO comments
   */
  public async scanProject(): Promise<TodoScanResult | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for TODO scanning');
      return null;
    }

    try {
      if (typeof window === 'undefined' || !window.electronAPI?.todo?.scanProject) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }

      const result = await window.electronAPI.todo.scanProject(this.currentProject) as TodoServiceResult<TodoScanResult>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] Scan completed:', result.data.todos.length, 'TODOs found');
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Scan failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error scanning project:', error);
      return null;
    }
  }

  /**
   * Scan for new TODOs since last scan
   */
  public async scanForNewTodos(): Promise<TodoItem[]> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for TODO scanning');
      return [];
    }

    try {
      if (typeof window === 'undefined' || !window.electronAPI?.todo?.scanNew) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return [];
      }

      const result = await window.electronAPI.todo.scanNew(this.currentProject) as TodoServiceResult<TodoItem[]>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] New TODOs found:', result.data.length);
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] New TODO scan failed:', result.error);
        return [];
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error scanning for new TODOs:', error);
      return [];
    }
  }

  /**
   * Validate if a TODO still exists in the code
   */
  public async validateTodo(todoId: string): Promise<boolean> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for TODO validation');
      return false;
    }

    try {
      if (typeof window === 'undefined' || !window.electronAPI?.todo?.validate) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return false;
      }

      const result = await window.electronAPI.todo.validate(todoId, this.currentProject) as TodoServiceResult<{ isValid: boolean }>;
      
      if (result.success && result.data) {
        return result.data.isValid;
      } else {
        console.error('[TODO-SERVICE-RENDERER] TODO validation failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error validating TODO:', error);
      return false;
    }
  }

  /**
   * Get TODO statistics
   */
  public async getStats(): Promise<TodoStats | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for TODO stats');
      return null;
    }

    try {
      if (!window.electronAPI?.todo?.getStats) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }
      
      const result = await window.electronAPI.todo.getStats(this.currentProject) as TodoServiceResult<TodoStats>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] TODO stats retrieved:', result.data);
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to get TODO stats:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error getting TODO stats:', error);
      return null;
    }
  }

  /**
   * Create tasks from TODOs
   */
  public async createTasks(todoIds?: string[]): Promise<Task[]> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for task creation');
      return [];
    }

    try {
      if (!window.electronAPI?.todo?.createTasks) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return [];
      }
      
      const result = await window.electronAPI.todo.createTasks(this.currentProject, todoIds) as TodoServiceResult<{ tasks: Task[]; count: number }>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] Created', result.data.count, 'tasks from TODOs');
        return result.data.tasks;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to create tasks:', result.error);
        return [];
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error creating tasks:', error);
      return [];
    }
  }

  /**
   * Get all TODO-task mappings
   */
  public async getMappings(): Promise<TodoTaskMapping[]> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for mappings');
      return [];
    }

    try {
      if (!window.electronAPI?.todo?.getMappings) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return [];
      }
      
      const result = await window.electronAPI.todo.getMappings(this.currentProject) as TodoServiceResult<TodoTaskMapping[]>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] Retrieved', result.data.length, 'mappings');
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to get mappings:', result.error);
        return [];
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error getting mappings:', error);
      return [];
    }
  }

  /**
   * Get mapping by TODO ID
   */
  public async getMappingByTodoId(todoId: string): Promise<TodoTaskMapping | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for mapping lookup');
      return null;
    }

    try {
      if (!window.electronAPI?.todo?.getMappingByTodo) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }
      
      const result = await window.electronAPI.todo.getMappingByTodo(todoId, this.currentProject) as TodoServiceResult<TodoTaskMapping>;
      
      if (result.success && result.data) {
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to get mapping by TODO ID:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error getting mapping by TODO ID:', error);
      return null;
    }
  }

  /**
   * Get mapping by task ID
   */
  public async getMappingByTaskId(taskId: string): Promise<TodoTaskMapping | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for mapping lookup');
      return null;
    }

    try {
      if (!window.electronAPI?.todo?.getMappingByTask) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }
      
      const result = await window.electronAPI.todo.getMappingByTask(taskId, this.currentProject) as TodoServiceResult<TodoTaskMapping>;
      
      if (result.success && result.data) {
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to get mapping by task ID:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error getting mapping by task ID:', error);
      return null;
    }
  }

  /**
   * Remove TODO-task mapping
   */
  public async removeMapping(todoId: string): Promise<boolean> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for mapping removal');
      return false;
    }

    try {
      if (!window.electronAPI?.todo?.removeMapping) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return false;
      }
      
      const result = await window.electronAPI.todo.removeMapping(todoId, this.currentProject) as TodoServiceResult<void>;
      
      if (result.success) {
        console.log('[TODO-SERVICE-RENDERER] Mapping removed successfully');
        return true;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to remove mapping:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error removing mapping:', error);
      return false;
    }
  }

  /**
   * Get TODO task settings
   */
  public async getSettings(): Promise<TodoSettings | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for settings');
      return null;
    }

    try {
      if (!window.electronAPI?.todo?.getSettings) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }
      
      const result = await window.electronAPI.todo.getSettings(this.currentProject) as TodoServiceResult<TodoSettings>;
      
      if (result.success && result.data) {
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to get settings:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error getting settings:', error);
      return null;
    }
  }

  /**
   * Update TODO task settings
   */
  public async updateSettings(settings: Partial<TodoSettings>): Promise<boolean> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for settings update');
      return false;
    }

    try {
      if (!window.electronAPI?.todo?.updateSettings) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return false;
      }
      
      const result = await window.electronAPI.todo.updateSettings(this.currentProject, settings) as TodoServiceResult<void>;
      
      if (result.success) {
        console.log('[TODO-SERVICE-RENDERER] Settings updated successfully');
        return true;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to update settings:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error updating settings:', error);
      return false;
    }
  }

  /**
   * Clean up invalid mappings
   */
  public async cleanupInvalidMappings(): Promise<number> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for cleanup');
      return 0;
    }

    try {
      if (!window.electronAPI?.todo?.cleanupInvalid) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return 0;
      }
      
      const result = await window.electronAPI.todo.cleanupInvalid(this.currentProject) as TodoServiceResult<{ removedCount: number }>;
      
      if (result.success && result.data) {
        console.log('[TODO-SERVICE-RENDERER] Cleaned up', result.data.removedCount, 'invalid mappings');
        return result.data.removedCount;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Failed to cleanup mappings:', result.error);
        return 0;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error cleaning up mappings:', error);
      return 0;
    }
  }

  /**
   * Sync TODOs with tasks (scan for new TODOs and create tasks)
   */
  public async sync(): Promise<TodoSyncResult | null> {
    if (!this.currentProject) {
      console.error('[TODO-SERVICE-RENDERER] No project set for sync');
      return null;
    }

    try {
      if (typeof window === 'undefined' || !window.electronAPI?.todo?.sync) {
        console.error('[TODO-SERVICE-RENDERER] ElectronAPI not available');
        return null;
      }

      const result = await window.electronAPI.todo.sync(this.currentProject) as TodoServiceResult<TodoSyncResult>;
      
      if (result.success && result.data) {
        if ('skipped' in result.data) {
          console.log('[TODO-SERVICE-RENDERER] Sync skipped');
          return { newTodos: 0, createdTasks: 0, tasks: [] };
        }
        
        console.log('[TODO-SERVICE-RENDERER] Sync completed:', result.data.createdTasks, 'new tasks created');
        return result.data;
      } else {
        console.error('[TODO-SERVICE-RENDERER] Sync failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[TODO-SERVICE-RENDERER] Error during sync:', error);
      return null;
    }
  }

  /**
   * Check if TODO scanning is available (project is set)
   */
  public isAvailable(): boolean {
    return this.currentProject !== null;
  }
}

export const todoService = TodoServiceRenderer.getInstance();