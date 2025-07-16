import { CodeVectorizationService } from '../../code-vectorization-service';
import { getProjectPathService } from '../../../services/project-path-service';

const codeVectorizationService = CodeVectorizationService.getInstance();

export async function executeCodeSearchTool(args: any): Promise<string> {
  try {
    // Check if service is ready, and initialize if not
    if (!codeVectorizationService.isReady()) {
      const projectPathService = getProjectPathService();
      const projectPath = projectPathService.getProjectPath();
      
      if (!projectPath) {
        return JSON.stringify({
          success: false,
          error: 'No project is currently open. Please open a project first.'
        });
      }
      
      console.log('[CODE-SEARCH-TOOL-MAIN] Initializing code vectorization service for project:', projectPath);
      try {
        await codeVectorizationService.initialize(projectPath);
      } catch (initError) {
        console.error('[CODE-SEARCH-TOOL-MAIN] Failed to initialize code vectorization service:', initError);
        return JSON.stringify({
          success: false,
          error: 'Failed to initialize code vectorization service. Please ensure the project is properly set up and vectorized.'
        });
      }
      
      // Check again after initialization
      if (!codeVectorizationService.isReady()) {
        return JSON.stringify({
          success: false,
          error: 'Code vectorization service is not ready. Please ensure the project is vectorized using the code_vectorization_status tool.'
        });
      }
    }

    // Perform the search
    const results = await codeVectorizationService.searchCode(args.query, {
      limit: args.limit || 10,
      type: args.type,
      language: args.language
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