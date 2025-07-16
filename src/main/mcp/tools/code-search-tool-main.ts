import { codeVectorizationService } from '../../code-vectorization-service';

export async function executeCodeSearchTool(args: any): Promise<string> {
  try {
    // Check if service is ready
    if (!codeVectorizationService.isReady()) {
      return JSON.stringify({
        success: false,
        error: 'Code vectorization service is not initialized. Please ensure a project is open and vectorized.'
      });
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