/**
 * Simplified Kanban Service
 * Core CRUD operations for kanban board management
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SimpleTask, TaskStatus, TaskComment, KanbanBoard, TaskEvent } from '../types/simple-kanban';

export class SimpleKanbanService extends EventEmitter {
  private static instance: SimpleKanbanService;
  private board: KanbanBoard | null = null;
  private projectPath: string | null = null;
  private boardFilePath: string | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
  }

  static getInstance(): SimpleKanbanService {
    if (!SimpleKanbanService.instance) {
      SimpleKanbanService.instance = new SimpleKanbanService();
    }
    return SimpleKanbanService.instance;
  }

  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    const kanbanDir = path.join(projectPath, '.labrats', 'kanban');
    await fs.mkdir(kanbanDir, { recursive: true });
    
    this.boardFilePath = path.join(kanbanDir, 'board.json');
    
    // Load or create board
    await this.loadBoard();
    
    // Setup auto-save
    this.setupAutoSave();
  }

  private async loadBoard(): Promise<void> {
    try {
      const data = await fs.readFile(this.boardFilePath!, 'utf8');
      this.board = JSON.parse(data, (key, value) => {
        if (key === 'createdAt' || key === 'updatedAt' || key === 'timestamp') {
          return new Date(value);
        }
        return value;
      });
    } catch (error) {
      // Create new board if none exists
      this.board = this.createEmptyBoard();
      await this.saveBoard();
    }
  }

  private createEmptyBoard(): KanbanBoard {
    return {
      id: uuidv4(),
      name: 'Project Tasks',
      columns: [
        { id: 'backlog', title: 'Backlog', tasks: [] },
        { id: 'todo', title: 'To Do', tasks: [] },
        { id: 'in-progress', title: 'In Progress', tasks: [] },
        { id: 'review', title: 'Review', tasks: [] },
        { id: 'done', title: 'Done', tasks: [] }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async saveBoard(): Promise<void> {
    if (!this.board || !this.boardFilePath) return;
    
    this.board.updatedAt = new Date();
    await fs.writeFile(this.boardFilePath, JSON.stringify(this.board, null, 2));
  }

  private setupAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    // Auto-save every 30 seconds if there are changes
    this.autoSaveTimer = setInterval(() => {
      this.saveBoard().catch(console.error);
    }, 30000);
  }

  // Task CRUD Operations

  async createTask(task: Partial<SimpleTask>): Promise<SimpleTask> {
    if (!this.board) throw new Error('Board not initialized');
    
    const newTask: SimpleTask = {
      id: uuidv4(),
      title: task.title || 'New Task',
      status: task.status || 'backlog',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...task,
      comments: []
    };
    
    // Add to appropriate column
    const column = this.board.columns.find(col => col.id === newTask.status);
    if (!column) throw new Error(`Invalid status: ${newTask.status}`);
    
    column.tasks.push(newTask);
    
    // Update blocking relationships
    if (newTask.blockedBy) {
      for (const blockerId of newTask.blockedBy) {
        const blocker = this.findTask(blockerId);
        if (blocker) {
          if (!blocker.blocks) blocker.blocks = [];
          if (!blocker.blocks.includes(newTask.id)) {
            blocker.blocks.push(newTask.id);
          }
        }
      }
    }
    
    await this.saveBoard();
    this.emit('task-event', { type: 'task-created', task: newTask } as TaskEvent);
    
    return newTask;
  }

  async updateTask(taskId: string, updates: Partial<SimpleTask>): Promise<SimpleTask | null> {
    if (!this.board) throw new Error('Board not initialized');
    
    const task = this.findTask(taskId);
    if (!task) return null;
    
    // Handle status change (move between columns)
    if (updates.status && updates.status !== task.status) {
      await this.moveTask(taskId, updates.status);
      // Task has been moved, find it again
      const movedTask = this.findTask(taskId);
      if (!movedTask) return null;
      Object.assign(movedTask, { ...updates, status: movedTask.status });
    } else {
      Object.assign(task, updates);
    }
    
    task.updatedAt = new Date();
    
    await this.saveBoard();
    this.emit('task-event', { type: 'task-updated', task } as TaskEvent);
    
    return task;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.board) throw new Error('Board not initialized');
    
    const task = this.findTask(taskId);
    if (!task) return false;
    
    // Remove from column
    for (const column of this.board.columns) {
      const index = column.tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        column.tasks.splice(index, 1);
        break;
      }
    }
    
    // Update blocking relationships
    if (task.blockedBy) {
      for (const blockerId of task.blockedBy) {
        const blocker = this.findTask(blockerId);
        if (blocker && blocker.blocks) {
          blocker.blocks = blocker.blocks.filter(id => id !== taskId);
        }
      }
    }
    
    if (task.blocks) {
      for (const blockedId of task.blocks) {
        const blocked = this.findTask(blockedId);
        if (blocked && blocked.blockedBy) {
          blocked.blockedBy = blocked.blockedBy.filter(id => id !== taskId);
        }
      }
    }
    
    await this.saveBoard();
    this.emit('task-event', { type: 'task-deleted', taskId } as TaskEvent);
    
    return true;
  }

  async moveTask(taskId: string, newStatus: TaskStatus): Promise<boolean> {
    if (!this.board) throw new Error('Board not initialized');
    
    let task: SimpleTask | null = null;
    let fromColumn: TaskStatus | null = null;
    
    // Find and remove task from current column
    for (const column of this.board.columns) {
      const index = column.tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        task = column.tasks[index];
        fromColumn = column.id;
        column.tasks.splice(index, 1);
        break;
      }
    }
    
    if (!task || !fromColumn) return false;
    
    // Add to new column
    const toColumn = this.board.columns.find(col => col.id === newStatus);
    if (!toColumn) return false;
    
    task.status = newStatus;
    task.updatedAt = new Date();
    toColumn.tasks.push(task);
    
    await this.saveBoard();
    this.emit('task-event', { 
      type: 'task-moved', 
      taskId, 
      from: fromColumn, 
      to: newStatus 
    } as TaskEvent);
    
    return true;
  }

  async addComment(taskId: string, authorId: string, authorName: string, content: string): Promise<TaskComment | null> {
    if (!this.board) throw new Error('Board not initialized');
    
    const task = this.findTask(taskId);
    if (!task) return null;
    
    const comment: TaskComment = {
      id: uuidv4(),
      authorId,
      authorName,
      content,
      timestamp: new Date()
    };
    
    if (!task.comments) task.comments = [];
    task.comments.push(comment);
    task.updatedAt = new Date();
    
    await this.saveBoard();
    this.emit('task-event', { type: 'comment-added', taskId, comment } as TaskEvent);
    
    return comment;
  }

  // Query methods

  getBoard(): KanbanBoard | null {
    return this.board;
  }

  getTask(taskId: string): SimpleTask | null {
    return this.findTask(taskId);
  }

  getTasksByStatus(status: TaskStatus): SimpleTask[] {
    if (!this.board) return [];
    
    const column = this.board.columns.find(col => col.id === status);
    return column ? column.tasks : [];
  }

  getBlockedTasks(): SimpleTask[] {
    if (!this.board) return [];
    
    const allTasks: SimpleTask[] = [];
    for (const column of this.board.columns) {
      allTasks.push(...column.tasks);
    }
    
    return allTasks.filter(task => task.blockedBy && task.blockedBy.length > 0);
  }

  // Utility methods

  private findTask(taskId: string): SimpleTask | null {
    if (!this.board) return null;
    
    for (const column of this.board.columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    
    return null;
  }

  async cleanup(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    await this.saveBoard();
    this.removeAllListeners();
  }
}

export const simpleKanbanService = SimpleKanbanService.getInstance();