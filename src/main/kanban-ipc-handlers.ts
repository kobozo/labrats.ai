import { ipcMain } from 'electron';
import { KanbanStorageService } from './kanban-storage-service';
import { Board, Task, Epic } from '../types/kanban';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Store current project path - handlers are global, but storage is per-project
let currentProjectPath: string | null = null;
let handlersRegistered = false;

export function setupKanbanHandlers(projectPath: string) {
  console.log('Setting up kanban handlers for project:', projectPath);
  currentProjectPath = projectPath;
  
  // Only register handlers once
  if (handlersRegistered) {
    console.log('Handlers already registered, just updating project path');
    return;
  }
  handlersRegistered = true;

  // Board operations
  ipcMain.handle('kanban:getBoard', async (_, projectPath: string, boardId: string) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    return await storage.getBoard(boardId);
  });

  ipcMain.handle('kanban:saveBoard', async (_, projectPath: string, board: Board) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    await storage.saveBoard(board);
    return { success: true };
  });

  // Task operations
  ipcMain.handle('kanban:getTasks', async (_, projectPath: string, boardId: string) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    const tasks = await storage.getTasks(boardId);
    
    // Check for branches for each task
    for (const task of tasks) {
      if (task.id) {
        task.hasBranch = await checkBranchExists(task.id, projectPath);
      }
    }
    
    return tasks;
  });

  ipcMain.handle('kanban:updateTask', async (_, projectPath: string, boardId: string, task: Task) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    console.log('Updating task:', boardId, task);
    await storage.updateTask(boardId, task);
    return { success: true };
  });

  ipcMain.handle('kanban:deleteTask', async (_, projectPath: string, boardId: string, taskId: string) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    await storage.deleteTask(boardId, taskId);
    return { success: true };
  });

  // Epic operations
  ipcMain.handle('kanban:getEpics', async (_, projectPath: string, boardId: string) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    return await storage.getEpics(boardId);
  });

  ipcMain.handle('kanban:updateEpic', async (_, projectPath: string, boardId: string, epic: Epic) => {
    if (!projectPath) throw new Error('No project path provided');
    const storage = new KanbanStorageService(projectPath);
    await storage.updateEpic(boardId, epic);
    return { success: true };
  });

  // Branch operations
  ipcMain.handle('kanban:checkBranches', async (_, projectPath: string) => {
    if (!projectPath) throw new Error('No project path provided');
    const branches = await getGitBranches(projectPath);
    return branches;
  });
}

async function checkBranchExists(ticketId: string, projectPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: projectPath });
    const branches = stdout.split('\n').map(b => b.trim());
    return branches.some(branch => branch.includes(ticketId));
  } catch {
    return false;
  }
}

async function getGitBranches(projectPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git branch -a', { cwd: projectPath });
    return stdout.split('\n')
      .map(b => b.trim())
      .filter(b => b.length > 0);
  } catch {
    return [];
  }
}