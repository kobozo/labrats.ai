import { codeVectorizationService } from '../../code-vectorization-service';
import { getProjectPathService } from '../../../services/project-path-service';

export async function executeFindSimilarCodeTool(args: any): Promise<string> {
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
      
      console.log('[FIND-SIMILAR-CODE-TOOL-MAIN] Initializing code vectorization service for project:', projectPath);
      try {
        await codeVectorizationService.initialize(projectPath);
      } catch (initError) {
        console.error('[FIND-SIMILAR-CODE-TOOL-MAIN] Failed to initialize code vectorization service:', initError);
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

    // Find similar code
    const results = await codeVectorizationService.findSimilarCode(args.codeSnippet, {
      limit: args.limit || 10,
      minSimilarity: args.minSimilarity || 0.8
    });

    // Format results
    const formattedResults = results.map((result, index) => {
      const doc = result.document;
      const metadata = doc.metadata;
      
      return {
        rank: index + 1,
        similarity: (result.similarity * 100).toFixed(1) + '%',
        type: metadata.codeType || metadata.type,
        name: metadata.functionName || metadata.className || metadata.name || 'Unknown',
        file: metadata.filePath,
        lines: metadata.lineStart && metadata.lineEnd ? `${metadata.lineStart}-${metadata.lineEnd}` : 'Unknown',
        language: metadata.language,
        description: metadata.aiDescription || 'No description available',
        code: doc.content
      };
    });

    // Analyze patterns
    const patterns = analyzeCodePatterns(formattedResults);

    return JSON.stringify({
      success: true,
      inputSnippetLength: args.codeSnippet.length,
      totalResults: formattedResults.length,
      patterns,
      results: formattedResults
    });
  } catch (error) {
    console.error('[FIND-SIMILAR-CODE-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

function analyzeCodePatterns(results: any[]): any {
  const typeCount: Record<string, number> = {};
  const languageCount: Record<string, number> = {};
  const fileCount = new Set(results.map(r => r.file)).size;
  
  results.forEach(result => {
    typeCount[result.type] = (typeCount[result.type] || 0) + 1;
    languageCount[result.language] = (languageCount[result.language] || 0) + 1;
  });

  return {
    uniqueFiles: fileCount,
    typeDistribution: typeCount,
    languageDistribution: languageCount,
    averageSimilarity: results.length > 0 
      ? (results.reduce((sum, r) => sum + parseFloat(r.similarity), 0) / results.length).toFixed(1) + '%'
      : '0%'
  };
}