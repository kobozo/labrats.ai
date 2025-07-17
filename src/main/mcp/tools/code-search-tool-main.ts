import { CodeVectorizationService } from '../../code-vectorization-service';
import { CodeVectorizationOrchestrator } from '../../code-vectorization-orchestrator';
import { getProjectPathService } from '../../../services/project-path-service';

// Use the same instance that the orchestrator uses
const orchestrator = CodeVectorizationOrchestrator.getInstance();
const codeVectorizationService = CodeVectorizationService.getInstance();

export async function executeCodeSearchTool(args: any): Promise<string> {
  try {
    console.log('[CODE-SEARCH-TOOL-MAIN] Executing code search with query:', args.query);
    
    // First check if orchestrator is initialized
    const orchestratorStatus = await orchestrator.getStatus();
    console.log('[CODE-SEARCH-TOOL-MAIN] Orchestrator status:', orchestratorStatus);
    
    // Get project path
    const projectPathService = getProjectPathService();
    const projectPath = projectPathService.getProjectPath();
    
    if (!projectPath) {
      return JSON.stringify({
        success: false,
        error: 'No project is currently open. Please open a project first.'
      });
    }
    
    // If orchestrator is not initialized, initialize it
    if (!orchestratorStatus.isInitialized) {
      console.log('[CODE-SEARCH-TOOL-MAIN] Orchestrator not initialized, initializing now...');
      try {
        await orchestrator.initialize(projectPath);
      } catch (initError) {
        console.error('[CODE-SEARCH-TOOL-MAIN] Failed to initialize orchestrator:', initError);
        return JSON.stringify({
          success: false,
          error: 'Failed to initialize code vectorization. Please ensure the project is properly set up and vectorized.'
        });
      }
    }
    
    // Check current service state after orchestrator initialization
    const currentProjectPath = codeVectorizationService.getProjectPath();
    console.log('[CODE-SEARCH-TOOL-MAIN] Current project path in service:', currentProjectPath);
    console.log('[CODE-SEARCH-TOOL-MAIN] Service ready state:', codeVectorizationService.isReady());
    
    // Verify service is ready
    if (!codeVectorizationService.isReady()) {
      return JSON.stringify({
        success: false,
        error: 'Code vectorization service is not ready. Please ensure the project is vectorized first.'
      });
    }
    
    // Get stats to verify we have vectors
    try {
      const stats = await codeVectorizationService.getStats();
      console.log('[CODE-SEARCH-TOOL-MAIN] Vector stats:', stats);
    } catch (e) {
      console.error('[CODE-SEARCH-TOOL-MAIN] Failed to get stats:', e);
    }

    // Perform the search
    const results = await codeVectorizationService.searchCode(args.query, {
      limit: args.limit || 10,
      type: args.type,
      language: args.language,
      minSimilarity: args.minSimilarity || 0.5
    });

    // Format results
    const formattedResults = results.map((result, index) => {
      const doc = result.document;
      const metadata = doc.metadata;
      
      return {
        rank: index + 1,
        score: result.similarity.toFixed(3),
        type: metadata.codeType || metadata.type,
        name: metadata.functionName || metadata.className || metadata.name || 'Unknown',
        file: metadata.filePath,
        lines: metadata.lineStart && metadata.lineEnd ? `${metadata.lineStart}-${metadata.lineEnd}` : 'Unknown',
        language: metadata.language,
        description: metadata.aiDescription || 'No description available',
        content: doc.content
      };
    });

    return JSON.stringify({
      success: true,
      query: args.query,
      totalResults: formattedResults.length,
      results: formattedResults
    });
  } catch (error) {
    console.error('[CODE-SEARCH-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}