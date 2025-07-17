import { Tool } from '../types';
import { codeVectorizationService } from '../../code-vectorization-service-renderer';

export const findSimilarCodeTool: Tool = {
  name: 'find_similar_code',
  description: 'Find code similar to a given code snippet. Useful for finding duplicates, similar implementations, or related code patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      codeSnippet: {
        type: 'string',
        description: 'The code snippet to find similar code for'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of similar code results to return',
        default: 10,
        minimum: 1,
        maximum: 50
      },
      minSimilarity: {
        type: 'number',
        description: 'Minimum similarity score (0-1) for results',
        default: 0.8,
        minimum: 0,
        maximum: 1
      }
    },
    required: ['codeSnippet']
  }
};

export async function executeFindSimilarCodeTool(args: any): Promise<any> {
  try {
    // Check if service is ready
    const isReady = await codeVectorizationService.isReady();
    if (!isReady) {
      return {
        success: false,
        error: 'Code vectorization service is not initialized. Please ensure a project is open and vectorized.'
      };
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

    return {
      success: true,
      inputSnippetLength: args.codeSnippet.length,
      totalResults: formattedResults.length,
      patterns,
      results: formattedResults
    };
  } catch (error) {
    console.error('[FIND-SIMILAR-CODE-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
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