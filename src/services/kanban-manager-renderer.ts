import { Board, Task, Epic } from '../types/kanban';

export class KanbanManagerRenderer {
  private static instance: KanbanManagerRenderer;
  private currentProjectPath: string | null = null;

  private constructor() {}

  static getInstance(): KanbanManagerRenderer {
    if (!KanbanManagerRenderer.instance) {
      KanbanManagerRenderer.instance = new KanbanManagerRenderer();
    }
    return KanbanManagerRenderer.instance;
  }

  setCurrentProject(projectPath: string | null): void {
    this.currentProjectPath = projectPath;
    console.log('[KanbanManager] Set current project:', projectPath);
  }

  async getBoard(boardId: string): Promise<Board | null> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return null;
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.getBoard) {
        const board = await window.electronAPI.kanban.getBoard(this.currentProjectPath, boardId);
        return board;
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
        return null;
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to get board:', error);
      return null;
    }
  }

  async saveBoard(board: Board): Promise<void> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return;
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.saveBoard) {
        const result = await window.electronAPI.kanban.saveBoard(this.currentProjectPath, board);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to save board');
        }
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to save board:', error);
      throw error;
    }
  }

  async getTasks(boardId: string): Promise<Task[]> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return [];
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.getTasks) {
        const tasks = await window.electronAPI.kanban.getTasks(this.currentProjectPath, boardId);
        return tasks || [];
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
        return [];
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to get tasks:', error);
      return [];
    }
  }

  async updateTask(boardId: string, task: Task): Promise<void> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return;
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.updateTask) {
        const result = await window.electronAPI.kanban.updateTask(this.currentProjectPath, boardId, task);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to update task');
        }
        console.log(`[KanbanManager] Updated task ${task.id}`);
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to update task:', error);
      throw error;
    }
  }

  async deleteTask(boardId: string, taskId: string): Promise<void> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return;
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.deleteTask) {
        const result = await window.electronAPI.kanban.deleteTask(this.currentProjectPath, boardId, taskId);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to delete task');
        }
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to delete task:', error);
      throw error;
    }
  }

  async getEpics(boardId: string): Promise<Epic[]> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return [];
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.getEpics) {
        const epics = await window.electronAPI.kanban.getEpics(this.currentProjectPath, boardId);
        return epics || [];
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
        return [];
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to get epics:', error);
      return [];
    }
  }

  async updateEpic(boardId: string, epic: Epic): Promise<void> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return;
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.updateEpic) {
        const result = await window.electronAPI.kanban.updateEpic(this.currentProjectPath, boardId, epic);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to update epic');
        }
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to update epic:', error);
      throw error;
    }
  }

  async checkBranches(): Promise<string[]> {
    try {
      if (!this.currentProjectPath) {
        console.error('[KanbanManager] No project path set');
        return [];
      }
      
      if (typeof window !== 'undefined' && window.electronAPI?.kanban?.checkBranches) {
        const branches = await window.electronAPI.kanban.checkBranches(this.currentProjectPath);
        return branches || [];
      } else {
        console.warn('[KanbanManager] ElectronAPI not available');
        return [];
      }
    } catch (error) {
      console.error('[KanbanManager] Failed to check branches:', error);
      return [];
    }
  }

  // Helper to create a new task with ticket number
  createTask(title: string, ticketNumber?: string): Task {
    const id = ticketNumber || `TASK-${Date.now()}`;
    return {
      id,
      title,
      description: '',
      assignee: 'LabRats',
      priority: 'medium',
      type: 'task',
      status: 'backlog',
      createdBy: 'user',
      primaryRats: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectPath: this.currentProjectPath || '',
      branchName: ticketNumber ? `feature/${ticketNumber}` : undefined
    };
  }

  // Helper to link tasks
  linkTasks(task1: Task, task2: Task): void {
    if (!task1.linkedTaskIds) task1.linkedTaskIds = [];
    if (!task2.linkedTaskIds) task2.linkedTaskIds = [];
    
    if (!task1.linkedTaskIds.includes(task2.id)) {
      task1.linkedTaskIds.push(task2.id);
    }
    if (!task2.linkedTaskIds.includes(task1.id)) {
      task2.linkedTaskIds.push(task1.id);
    }
  }

  // Helper to create a new epic
  createEpic(title: string, description: string, color: string): Epic {
    return {
      id: `EPIC-${Date.now()}`,
      title,
      description,
      color,
      taskIds: []
    };
  }

  // Helper to add task to epic
  addTaskToEpic(task: Task, epic: Epic): void {
    task.epicId = epic.id;
    if (!epic.taskIds.includes(task.id)) {
      epic.taskIds.push(task.id);
    }
  }

  getTaskDirectory(): string {
    if (!this.currentProjectPath) return '';
    return `${this.currentProjectPath}/.labrats/boards/tasks`;
  }
}

// Export singleton instance
export const kanbanManager = KanbanManagerRenderer.getInstance();