import { Board, Task, Epic } from '../types/kanban';

class KanbanService {
  async getBoard(boardId: string): Promise<Board | null> {
    return await window.electronAPI.kanban?.getBoard(boardId) || null;
  }

  async saveBoard(board: Board): Promise<void> {
    await window.electronAPI.kanban?.saveBoard(board);
  }

  async getTasks(boardId: string): Promise<Task[]> {
    return await window.electronAPI.kanban?.getTasks(boardId) || [];
  }

  async updateTask(boardId: string, task: Task): Promise<void> {
    await window.electronAPI.kanban?.updateTask(boardId, task);
  }

  async deleteTask(boardId: string, taskId: string): Promise<void> {
    await window.electronAPI.kanban?.deleteTask(boardId, taskId);
  }

  async getEpics(boardId: string): Promise<Epic[]> {
    return await window.electronAPI.kanban?.getEpics(boardId) || [];
  }

  async updateEpic(boardId: string, epic: Epic): Promise<void> {
    await window.electronAPI.kanban?.updateEpic(boardId, epic);
  }

  async checkBranches(): Promise<string[]> {
    return await window.electronAPI.kanban?.checkBranches() || [];
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
      projectPath: '', // Will be set by backend
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
}

export const kanbanService = new KanbanService();