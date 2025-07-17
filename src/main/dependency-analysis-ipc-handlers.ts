import { ipcMain } from 'electron';
import { dependencyAnalysis } from './dependency-analysis-service';
import { codeFileWatcher } from './code-file-watcher-service';
import { EventEmitter } from 'events';

class DependencyAnalysisIPCHandlers {
  private static instance: DependencyAnalysisIPCHandlers;
  private mainWindow: Electron.BrowserWindow | null = null;
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map();

  private constructor() {}

  static getInstance(): DependencyAnalysisIPCHandlers {
    if (!DependencyAnalysisIPCHandlers.instance) {
      DependencyAnalysisIPCHandlers.instance = new DependencyAnalysisIPCHandlers();
    }
    return DependencyAnalysisIPCHandlers.instance;
  }

  initialize(mainWindow: Electron.BrowserWindow): void {
    console.log('[DEPENDENCY-IPC] Initializing dependency analysis for window');
    this.mainWindow = mainWindow;
    this.setupEventForwarding();
    console.log('[DEPENDENCY-IPC] Dependency analysis initialized for window successfully');
  }

  registerHandlers(): void {
    console.log('[DEPENDENCY-IPC] Registering dependency analysis IPC handlers');
    
    // Initialize dependency analysis
    ipcMain.handle('dependency-analysis:initialize', async (_, projectPath: string) => {
      try {
        await dependencyAnalysis.initialize(projectPath);
        
        // Start watching for file changes if not already watching
        const watcherStatus = codeFileWatcher.getStatus();
        if (!watcherStatus.isWatching) {
          await codeFileWatcher.start(projectPath);
        }
        
        // Listen for file changes to update dependencies
        codeFileWatcher.on('fileProcessed', this.handleFileChange.bind(this));
        
        return { success: true };
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to initialize:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Analyze project dependencies
    ipcMain.handle('dependency-analysis:analyze', async (_, patterns?: string[]) => {
      try {
        await dependencyAnalysis.analyzeProject(patterns);
        return { success: true };
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to analyze:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Get dependency graph
    ipcMain.handle('dependency-analysis:get-graph', async () => {
      try {
        const graph = dependencyAnalysis.getGraph();
        // Convert Map to array for serialization
        return {
          nodes: Array.from(graph.nodes.values()),
          edges: graph.edges,
          timestamp: graph.timestamp,
        };
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to get graph:', error);
        return null;
      }
    });

    // Get dependencies for a specific file
    ipcMain.handle('dependency-analysis:get-dependencies', async (_, filePath: string) => {
      try {
        const node = await dependencyAnalysis.getDependencies(filePath);
        return node;
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to get dependencies:', error);
        return null;
      }
    });

    // Get dependents for a specific file
    ipcMain.handle('dependency-analysis:get-dependents', async (_, filePath: string) => {
      try {
        const dependents = await dependencyAnalysis.getDependents(filePath);
        return dependents;
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to get dependents:', error);
        return [];
      }
    });

    // Find dependency path between two files
    ipcMain.handle('dependency-analysis:find-path', async (_, from: string, to: string) => {
      try {
        const path = await dependencyAnalysis.findDependencyPath(from, to);
        return path;
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to find path:', error);
        return null;
      }
    });

    // Get dependency stats
    ipcMain.handle('dependency-analysis:get-stats', async () => {
      try {
        const stats = await dependencyAnalysis.getStats();
        return stats;
      } catch (error) {
        console.error('[DEPENDENCY-IPC] Failed to get stats:', error);
        return null;
      }
    });
  }

  private setupEventForwarding(): void {
    // Forward events from dependency analysis service to renderer
    const events = [
      'initialized',
      'analysis:start',
      'file:analyzed',
      'analysis:complete',
      'saved',
      'loaded',
    ];

    events.forEach(eventName => {
      const handler = (...args: any[]) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(`dependency-analysis:${eventName}`, ...args);
        }
      };
      
      this.eventHandlers.set(eventName, handler);
      dependencyAnalysis.on(eventName, handler);
    });
  }

  private handleFileChange(event: { filePath: string; type: string; success: boolean }): void {
    if (!event.success) return;
    
    // Update dependencies when files change
    if (event.type === 'add' || event.type === 'change') {
      dependencyAnalysis.updateFile(event.filePath);
    } else if (event.type === 'unlink') {
      dependencyAnalysis.deleteFile(event.filePath);
    }
  }

  cleanup(): void {
    // Remove event listeners
    this.eventHandlers.forEach((handler, eventName) => {
      dependencyAnalysis.removeListener(eventName, handler);
    });
    this.eventHandlers.clear();
    
    codeFileWatcher.removeListener('fileProcessed', this.handleFileChange.bind(this));
  }
}

export const dependencyAnalysisIPCHandlers = DependencyAnalysisIPCHandlers.getInstance();