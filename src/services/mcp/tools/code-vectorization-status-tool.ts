import { Tool } from '../types';
import { codeVectorizationOrchestrator } from '../../code-vectorization-orchestrator-renderer';

export const codeVectorizationStatusTool: Tool = {
  name: 'code_vectorization_status',
  description: 'Get the status of code vectorization including progress, statistics, and control operations.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The action to perform',
        enum: ['get_status', 'start_vectorization', 'stop_watching', 'force_reindex']
      },
      filePatterns: {
        type: 'array',
        description: 'File patterns to vectorize (only for start_vectorization action)',
        items: {
          type: 'string'
        },
        optional: true
      }
    },
    required: ['action']
  }
};

export async function executeCodeVectorizationStatusTool(args: any): Promise<any> {
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
        return {
          success: false,
          error: `Unknown action: ${args.action}`
        };
    }
  } catch (error) {
    console.error('[CODE-VECTORIZATION-STATUS-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function getVectorizationStatus(): Promise<any> {
  try {
    const status = await codeVectorizationOrchestrator.getStatus();
    
    // Format the status for better readability
    const formattedStatus = {
      initialized: status.isInitialized,
      currentPhase: status.progress.phase,
      isVectorizing: status.isVectorizing,
      isWatching: status.isWatching,
      progress: {
        filesProcessed: status.progress.filesProcessed,
        totalFiles: status.progress.totalFiles,
        errors: status.progress.errors,
        percentComplete: status.progress.totalFiles > 0 
          ? Math.round((status.progress.filesProcessed / status.progress.totalFiles) * 100)
          : 0,
        currentFile: status.progress.currentFile || 'None',
        estimatedTimeRemaining: status.progress.estimatedTimeRemaining 
          ? `${Math.round(status.progress.estimatedTimeRemaining / 1000)}s`
          : 'Unknown'
      },
      statistics: {
        totalFiles: status.stats.totalFiles,
        vectorizedFiles: status.stats.vectorizedFiles,
        totalCodeElements: status.stats.totalElements,
        vectorizedElements: status.stats.vectorizedElements,
        lastSync: status.stats.lastSync || 'Never',
        coveragePercent: status.stats.totalFiles > 0
          ? Math.round((status.stats.vectorizedFiles / status.stats.totalFiles) * 100)
          : 0
      }
    };

    return {
      success: true,
      action: 'get_status',
      status: formattedStatus
    };
  } catch (error) {
    // If orchestrator is not initialized, try to get basic status
    try {
      const isReady = await window.electronAPI.codeVectorization!.isReady();
      return {
        success: true,
        action: 'get_status',
        status: {
          initialized: false,
          serviceReady: isReady,
          message: 'Code vectorization orchestrator not initialized. Use start_vectorization to begin.'
        }
      };
    } catch {
      return {
        success: true,
        action: 'get_status',
        status: {
          initialized: false,
          serviceReady: false,
          message: 'Code vectorization service not available.'
        }
      };
    }
  }
}

async function startVectorization(filePatterns?: string[]): Promise<any> {
  try {
    // Get current project path
    const projectPath = await window.electronAPI.getProjectPath();
    if (!projectPath) {
      return {
        success: false,
        error: 'No project is currently open'
      };
    }

    // Initialize orchestrator
    await codeVectorizationOrchestrator.initialize(projectPath);
    
    // Start vectorization
    await codeVectorizationOrchestrator.vectorizeProject(filePatterns);

    return {
      success: true,
      action: 'start_vectorization',
      message: 'Code vectorization started successfully',
      projectPath,
      filePatterns: filePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start vectorization'
    };
  }
}

async function stopWatching(): Promise<any> {
  try {
    await codeVectorizationOrchestrator.stopWatching();
    
    return {
      success: true,
      action: 'stop_watching',
      message: 'File watching stopped successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop watching'
    };
  }
}

async function forceReindex(): Promise<any> {
  try {
    await codeVectorizationOrchestrator.forceReindex();
    
    return {
      success: true,
      action: 'force_reindex',
      message: 'Force reindex initiated. This may take some time depending on project size.'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to force reindex'
    };
  }
}