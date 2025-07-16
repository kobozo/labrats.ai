import { codeVectorizationService } from '../../code-vectorization-service';
import { codeFileWatcher } from '../../code-file-watcher-service';

export async function executeCodeVectorizationStatusTool(args: any): Promise<string> {
  try {
    switch (args.action) {
      case 'get_status':
        return await getVectorizationStatus();
      
      case 'start_vectorization':
        return await startVectorization(args.filePatterns);
      
      case 'stop_watching':
        return await stopWatching();
      
      case 'force_reindex':
        return await forceReindex();
      
      default:
        return JSON.stringify({
          success: false,
          error: `Unknown action: ${args.action}`
        });
    }
  } catch (error) {
    console.error('[CODE-VECTORIZATION-STATUS-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

async function getVectorizationStatus(): Promise<string> {
  try {
    const isReady = codeVectorizationService.isReady();
    const stats = await codeVectorizationService.getStats();
    const watcherStatus = codeFileWatcher.getStatus();
    
    // Format the status for better readability
    const formattedStatus = {
      initialized: isReady,
      currentPhase: isReady ? 'ready' : 'uninitialized',
      isVectorizing: false, // In main process, we don't have active vectorization tracking
      isWatching: watcherStatus.isWatching,
      progress: {
        filesProcessed: stats.vectorizedFiles,
        totalFiles: stats.totalFiles,
        errors: 0,
        percentComplete: stats.totalFiles > 0 
          ? Math.round((stats.vectorizedFiles / stats.totalFiles) * 100)
          : 0,
        currentFile: 'None',
        estimatedTimeRemaining: 'Unknown'
      },
      statistics: {
        totalFiles: stats.totalFiles,
        vectorizedFiles: stats.vectorizedFiles,
        totalCodeElements: stats.totalElements,
        vectorizedElements: stats.vectorizedElements,
        lastSync: stats.lastSync || 'Never',
        coveragePercent: stats.totalFiles > 0
          ? Math.round((stats.vectorizedFiles / stats.totalFiles) * 100)
          : 0
      }
    };

    return JSON.stringify({
      success: true,
      action: 'get_status',
      status: formattedStatus
    });
  } catch (error) {
    return JSON.stringify({
      success: true,
      action: 'get_status',
      status: {
        initialized: false,
        serviceReady: false,
        message: 'Code vectorization service not available.'
      }
    });
  }
}

async function startVectorization(filePatterns?: string[]): Promise<string> {
  try {
    // Get current project path from the service
    const projectPath = codeVectorizationService.getProjectPath();
    if (!projectPath) {
      return JSON.stringify({
        success: false,
        error: 'No project is currently open'
      });
    }

    // Initialize if not already
    if (!codeVectorizationService.isReady()) {
      await codeVectorizationService.initialize(projectPath);
    }
    
    // Start vectorization with default patterns if none provided
    const patterns = filePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    await codeVectorizationService.vectorizeProject(patterns);
    
    // Start watching
    await codeFileWatcher.start(projectPath);

    return JSON.stringify({
      success: true,
      action: 'start_vectorization',
      message: 'Code vectorization started successfully',
      projectPath,
      filePatterns: filePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start vectorization'
    });
  }
}

async function stopWatching(): Promise<string> {
  try {
    codeFileWatcher.stop();
    
    return JSON.stringify({
      success: true,
      action: 'stop_watching',
      message: 'File watching stopped successfully'
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop watching'
    });
  }
}

async function forceReindex(): Promise<string> {
  try {
    // Get all stats first
    const stats = await codeVectorizationService.getStats();
    
    // Clear all vectors
    console.log('[CODE-VECTORIZATION-STATUS-TOOL-MAIN] Starting force reindex...');
    
    // Re-vectorize the project
    await codeVectorizationService.vectorizeProject();
    
    return JSON.stringify({
      success: true,
      action: 'force_reindex',
      message: 'Force reindex initiated. This may take some time depending on project size.'
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to force reindex'
    });
  }
}