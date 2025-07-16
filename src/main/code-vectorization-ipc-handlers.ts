import { ipcMain } from 'electron';
import { CodeVectorizationService } from './code-vectorization-service';

const codeVectorizationService = CodeVectorizationService.getInstance();

export function setupCodeVectorizationIpcHandlers(): void {
  console.log('[CODE-VECTORIZATION-IPC] Setting up IPC handlers');

  // Initialize service
  ipcMain.handle('code-vectorization:initialize', async (event, projectPath: string) => {
    try {
      await codeVectorizationService.initialize(projectPath);
      return { success: true };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to initialize:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Check if service is ready
  ipcMain.handle('code-vectorization:isReady', async () => {
    return codeVectorizationService.isReady();
  });

  // Vectorize a single file
  ipcMain.handle('code-vectorization:vectorizeFile', async (event, filePath: string) => {
    try {
      const docs = await codeVectorizationService.vectorizeFile(filePath);
      return { success: true, documents: docs };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to vectorize file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Vectorize entire project
  ipcMain.handle('code-vectorization:vectorizeProject', async (event, filePatterns?: string[]) => {
    try {
      await codeVectorizationService.vectorizeProject(filePatterns);
      return { success: true };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to vectorize project:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get statistics
  ipcMain.handle('code-vectorization:getStats', async () => {
    try {
      const stats = await codeVectorizationService.getStats();
      return { success: true, stats };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to get stats:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Search code
  ipcMain.handle('code-vectorization:searchCode', async (event, query: string, options?: any) => {
    try {
      const results = await codeVectorizationService.searchCode(query, options);
      return { success: true, results };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to search code:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Find similar code
  ipcMain.handle('code-vectorization:findSimilarCode', async (event, codeSnippet: string, options?: any) => {
    try {
      const results = await codeVectorizationService.findSimilarCode(codeSnippet, options);
      return { success: true, results };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to find similar code:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete file vectors
  ipcMain.handle('code-vectorization:deleteFileVectors', async (event, filePath: string) => {
    try {
      await codeVectorizationService.deleteFileVectors(filePath);
      return { success: true };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to delete file vectors:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Pre-scan project
  ipcMain.handle('code-vectorization:preScanProject', async (event, filePatterns?: string[]) => {
    try {
      const result = await codeVectorizationService.preScanProject(filePatterns);
      return { success: true, result };
    } catch (error) {
      console.error('[CODE-VECTORIZATION-IPC] Failed to pre-scan project:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}