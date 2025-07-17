import { ipcMain } from 'electron';
import { lineCounterService } from './line-counter-service';
import { ConfigManager } from './config';

export function setupLineCounterIpcHandlers(): void {
  console.log('[LINE-COUNTER-IPC] Setting up IPC handlers');

  ipcMain.handle('line-counter:count', async (event, projectPath: string) => {
    try {
      // Get exclude patterns from config - use comprehensive patterns
      const configManager = new ConfigManager();
      const fileExplorerPatterns = configManager.get('fileExplorer', 'excludePatterns') || [];
      
      // Try to get todo excludedPaths from raw config (not typed)
      let todoExcludedPaths: string[] = [];
      try {
        const rawConfig = configManager.getAll();
        todoExcludedPaths = (rawConfig as any).todo?.excludedPaths || [];
      } catch (error) {
        console.warn('[LINE-COUNTER-IPC] Could not get todo excludedPaths:', error);
      }
      
      // Combine and deduplicate exclude patterns
      const excludePatterns = [...new Set([...fileExplorerPatterns, ...todoExcludedPaths])];
      
      console.log('[LINE-COUNTER-IPC] Counting lines for:', projectPath);
      console.log('[LINE-COUNTER-IPC] Using exclude patterns:', excludePatterns);
      
      const result = await lineCounterService.countLinesOfCode(projectPath, excludePatterns);
      
      return { 
        success: true, 
        result: {
          ...result,
          formattedTotal: lineCounterService.formatLineCount(result.totalLines)
        }
      };
    } catch (error) {
      console.error('[LINE-COUNTER-IPC] Failed to count lines:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}