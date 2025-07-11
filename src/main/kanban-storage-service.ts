import { promises as fs } from 'fs';
import path from 'path';
import { Board, Task, Epic } from '../types/kanban';

export class KanbanStorageService {
  private boardsPath: string;

  constructor(projectPath: string) {
    this.boardsPath = path.join(projectPath, '.labrats', 'boards');
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.boardsPath, { recursive: true });
    await fs.mkdir(path.join(this.boardsPath, 'tasks'), { recursive: true });
  }

  // Board operations
  async getBoard(boardId: string): Promise<Board | null> {
    try {
      const boardPath = path.join(this.boardsPath, 'boards.json');
      const data = await fs.readFile(boardPath, 'utf8');
      const boards = JSON.parse(data);
      return boards[boardId] || null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveBoard(board: Board): Promise<void> {
    await this.ensureDirectories();
    
    // Save board metadata
    const boardsPath = path.join(this.boardsPath, 'boards.json');
    let boards: Record<string, Board> = {};
    
    try {
      const data = await fs.readFile(boardsPath, 'utf8');
      boards = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }
    
    boards[board.boardId] = board;
    await fs.writeFile(boardsPath, JSON.stringify(boards, null, 2));
    
    // Save tasks separately for better performance on large boards
    const tasksPath = path.join(this.boardsPath, 'tasks', `${board.boardId}.json`);
    await fs.writeFile(tasksPath, JSON.stringify(board.tasks, null, 2));
  }

  async getTasks(boardId: string): Promise<Task[]> {
    try {
      const tasksPath = path.join(this.boardsPath, 'tasks', `${boardId}.json`);
      const data = await fs.readFile(tasksPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async updateTask(boardId: string, task: Task): Promise<void> {
    const tasks = await this.getTasks(boardId);
    const index = tasks.findIndex(t => t.id === task.id);
    
    if (index !== -1) {
      tasks[index] = { ...task, updatedAt: new Date().toISOString() };
    } else {
      tasks.push({ ...task, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    
    const tasksPath = path.join(this.boardsPath, 'tasks', `${boardId}.json`);
    await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2));
  }

  async deleteTask(boardId: string, taskId: string): Promise<void> {
    const tasks = await this.getTasks(boardId);
    const filteredTasks = tasks.filter(t => t.id !== taskId);
    
    const tasksPath = path.join(this.boardsPath, 'tasks', `${boardId}.json`);
    await fs.writeFile(tasksPath, JSON.stringify(filteredTasks, null, 2));
  }

  // Epic operations
  async getEpics(boardId: string): Promise<Epic[]> {
    const board = await this.getBoard(boardId);
    return board?.epics || [];
  }

  async updateEpic(boardId: string, epic: Epic): Promise<void> {
    const board = await this.getBoard(boardId);
    if (!board) return;
    
    const index = board.epics.findIndex(e => e.id === epic.id);
    if (index !== -1) {
      board.epics[index] = epic;
    } else {
      board.epics.push(epic);
    }
    
    await this.saveBoard(board);
  }
}