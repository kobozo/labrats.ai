import { Tool } from '../types';
import { codeVectorizationService } from '../../code-vectorization-service-renderer';

export const codeSearchTool: Tool = {
  name: 'search_code',
  description: 'Search for code using natural language queries. Returns code snippets that match the semantic meaning of your query.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language description of what you are looking for (e.g., "function that handles user authentication", "code that processes payment")'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 10,
        minimum: 1,
        maximum: 50
      },
      type: {
        type: 'string',
        description: 'Filter by code element type',
        enum: ['function', 'class', 'method', 'variable', 'import', 'export', 'interface', 'enum'],
        optional: true
      },
      language: {
        type: 'string',
        description: 'Filter by programming language',
        enum: ['typescript', 'javascript', 'python', 'java', 'go', 'ruby', 'php', 'csharp', 'rust', 'swift', 'kotlin'],
        optional: true
      },
      minSimilarity: {
        type: 'number',
        description: 'Minimum similarity score (0-1) for results',
        default: 0.7,
        minimum: 0,
        maximum: 1
      }
    },
    required: ['query']
  }
};

export async function executeCodeSearchTool(args: any): Promise<any> {
  try {
    // Check if service is ready
    const isReady = await codeVectorizationService.isReady();
    if (!isReady) {
      return {
        success: false,
        error: 'Code vectorization service is not initialized. Please ensure a project is open and vectorized.'
      };
    }

    // Search for code
    const results = await codeVectorizationService.searchCode(args.query, {
      limit: args.limit || 10,
      type: args.type,
      language: args.language,
      minSimilarity: args.minSimilarity || 0.7
    });

    // Format results for better readability
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
        preview: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '')
      };
    });

    return {
      success: true,
      query: args.query,
      totalResults: formattedResults.length,
      results: formattedResults
    };
  } catch (error) {
    console.error('[CODE-SEARCH-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}