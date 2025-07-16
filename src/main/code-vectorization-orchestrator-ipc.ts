import { ipcMain } from 'electron';
import { CodeVectorizationOrchestrator } from './code-vectorization-orchestrator';

const orchestrator = CodeVectorizationOrchestrator.getInstance();

export function setupCodeVectorizationOrchestratorHandlers(): void {
  console.log('[CODE-ORCHESTRATOR-IPC] Setting up IPC handlers');

  // Initialize orchestrator
  ipcMain.handle('code-orchestrator:initialize', async (event, projectPath: string) => {
    try {
      await orchestrator.initialize(projectPath);
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to initialize:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Start project vectorization
  ipcMain.handle('code-orchestrator:vectorizeProject', async (event, filePatterns?: string[], concurrency: number = 4) => {
    try {
      await orchestrator.vectorizeProject(filePatterns, concurrency);
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to vectorize project:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Start watching
  ipcMain.handle('code-orchestrator:startWatching', async () => {
    try {
      await orchestrator.startWatching();
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to start watching:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Stop watching
  ipcMain.handle('code-orchestrator:stopWatching', async () => {
    try {
      await orchestrator.stopWatching();
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to stop watching:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get status
  ipcMain.handle('code-orchestrator:getStatus', async () => {
    try {
      const status = await orchestrator.getStatus();
      return { success: true, status };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to get status:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Force reindex
  ipcMain.handle('code-orchestrator:forceReindex', async () => {
    try {
      await orchestrator.forceReindex();
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to force reindex:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Shutdown
  ipcMain.handle('code-orchestrator:shutdown', async () => {
    try {
      await orchestrator.shutdown();
      return { success: true };
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR-IPC] Failed to shutdown:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Forward events to renderer
  const eventsToForward = [
    'initialized',
    'vectorizationComplete',
    'watchingStarted',
    'watchingStopped',
    'fileChange',
    'incrementalUpdateStart',
    'fileProcessed',
    'incrementalUpdateComplete',
    'branchChanged',
    'branchReindexStart',
    'branchReindexProgress',
    'branchReindexComplete',
    'progressUpdate',
    'shutdown',
  ];

  eventsToForward.forEach(eventName => {
    orchestrator.on(eventName, (data) => {
      // Send to all windows
      const { BrowserWindow } = require('electron');
      BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
        if (!window.isDestroyed()) {
          window.webContents.send(`code-orchestrator:${eventName}`, data);
        }
      });
    });
  });
}