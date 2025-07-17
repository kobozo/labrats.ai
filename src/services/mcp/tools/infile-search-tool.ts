import { Tool } from '../types';

export const inFileSearchTool: Tool = {
  name: 'search_in_files',
  description: 'Search for text content within files. Supports case sensitivity, regex patterns, and include/exclude filters. Returns matches with line numbers and context.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to find within file contents'
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether the search should be case sensitive',
        default: false
      },
      useRegex: {
        type: 'boolean',
        description: 'Whether to treat the query as a regular expression',
        default: false
      },
      limit: {
        type: 'number',
        description: 'Maximum number of files to search',
        default: 100,
        minimum: 1,
        maximum: 500
      },
      maxMatchesPerFile: {
        type: 'number',
        description: 'Maximum number of matches to return per file',
        default: 10,
        minimum: 1,
        maximum: 50
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

export async function executeInFileSearchTool(args: any): Promise<any> {
  try {
    // This is handled by the main process
    const result = await window.electronAPI.mcp?.callTool('search_in_files', args);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return result || { success: false, error: "No result received" };
  } catch (error) {
    console.error('[INFILE-SEARCH-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}