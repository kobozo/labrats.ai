import { ipcMain } from 'electron';
import { aiDescriptionService } from './ai-description-service';

export function registerAIDescriptionHandlers(): void {
  // Get human-readable content for a file
  ipcMain.handle('ai-description:get-human-readable', async (event, filePath: string) => {
    try {
      const content = await aiDescriptionService.getHumanReadableContent(filePath);
      return { success: true, content };
    } catch (error) {
      console.error('[AI-DESCRIPTION-IPC] Error getting human-readable content:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get descriptions for a file
  ipcMain.handle('ai-description:get-file-descriptions', async (event, filePath: string) => {
    try {
      const descriptions = await aiDescriptionService.getFileDescriptions(filePath);
      return { success: true, descriptions };
    } catch (error) {
      console.error('[AI-DESCRIPTION-IPC] Error getting file descriptions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Check if a file has descriptions
  ipcMain.handle('ai-description:has-descriptions', async (event, filePath: string) => {
    try {
      const hasDescriptions = aiDescriptionService.hasDescriptions(filePath);
      return { success: true, hasDescriptions };
    } catch (error) {
      console.error('[AI-DESCRIPTION-IPC] Error checking descriptions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get all files with descriptions
  ipcMain.handle('ai-description:get-files-with-descriptions', async (event) => {
    try {
      const files = aiDescriptionService.getFilesWithDescriptions();
      return { success: true, files };
    } catch (error) {
      console.error('[AI-DESCRIPTION-IPC] Error getting files with descriptions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get statistics
  ipcMain.handle('ai-description:get-stats', async (event) => {
    try {
      const stats = aiDescriptionService.getStats();
      return { success: true, stats };
    } catch (error) {
      console.error('[AI-DESCRIPTION-IPC] Error getting stats:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}