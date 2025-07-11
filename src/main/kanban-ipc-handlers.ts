import { ipcMain } from 'electron';
import { KanbanStorageService } from './kanban-storage-service';
import { Board, Task, Epic } from '../types/kanban';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function setupKanbanHandlers(projectPath: string) {
  const storage = new KanbanStorageService(projectPath);

  // Board operations
  ipcMain.handle('kanban:getBoard', async (_, boardId: string) => {
    return await storage.getBoard(boardId);
  });

  ipcMain.handle('kanban:saveBoard', async (_, board: Board) => {
    await storage.saveBoard(board);
    return { success: true };
  });

  // Task operations
  ipcMain.handle('kanban:getTasks', async (_, boardId: string) => {
    const tasks = await storage.getTasks(boardId);
    
    // Check for branches for each task
    for (const task of tasks) {
      if (task.id) {
        task.hasBranch = await checkBranchExists(task.id, projectPath);
      }
    }
    
    return tasks;
  });

  ipcMain.handle('kanban:updateTask', async (_, { boardId, task }: { boardId: string; task: Task }) => {
    await storage.updateTask(boardId, task);
    return { success: true };
  });

  ipcMain.handle('kanban:deleteTask', async (_, { boardId, taskId }: { boardId: string; taskId: string }) => {
    await storage.deleteTask(boardId, taskId);
    return { success: true };
  });

  // Epic operations
  ipcMain.handle('kanban:getEpics', async (_, boardId: string) => {
    return await storage.getEpics(boardId);
  });

  ipcMain.handle('kanban:updateEpic', async (_, { boardId, epic }: { boardId: string; epic: Epic }) => {
    await storage.updateEpic(boardId, epic);
    return { success: true };
  });

  // Branch operations
  ipcMain.handle('kanban:checkBranches', async () => {
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