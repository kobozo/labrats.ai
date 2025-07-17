import { Tool } from '../types';

export const searchWithContextTool: Tool = {
  name: 'search_with_context',
  description: 'Search for text within files and get the containing code element context (function, class, method). Combines search with AST parsing for better code understanding.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find within file contents'
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether the search should be case sensitive (default: false)',
        default: false
      },
      useRegex: {
        type: 'boolean',
        description: 'Whether to treat the query as a regular expression (default: false)',
        default: false
      },
      limit: {
        type: 'number',
        description: 'Maximum number of files to search (default: 50, max: 200)',
        default: 50,
        minimum: 1,
        maximum: 200
      },
      maxMatchesPerFile: {
        type: 'number',
        description: 'Maximum number of matches to return per file (default: 5, max: 20)',
        default: 5,
        minimum: 1,
        maximum: 20
      },
      includeCodeContext: {
        type: 'boolean',
        description: 'Whether to include code element context (default: true)',
        default: true
      },
      includePatterns: {
        type: 'string',
        description: 'Comma-separated patterns to include files (e.g., "src/, *.js, component")',
        optional: true
      },
      excludePatterns: {
        type: 'string',
        description: 'Comma-separated patterns to exclude files (e.g., "node_modules/, *.min.js, test/")',
        optional: true
      }
    },
    required: ['query']
  }
};

export async function executeSearchWithContextTool(args: any): Promise<any> {
  try {
    // This is handled by the main process
    const result = await window.electronAPI.mcp?.callTool('search_with_context', args);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return result || { success: false, error: "No result received" };
  } catch (error) {
    console.error('[SEARCH-WITH-CONTEXT-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}