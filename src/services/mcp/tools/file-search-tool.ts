import { Tool } from '../types';

export const fileSearchTool: Tool = {
  name: 'search_files',
  description: 'Search for files by name and path. Returns files that match the search query in their filename or path.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against file names and paths (case-insensitive)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 50,
        minimum: 1,
        maximum: 200
      },
      includePatterns: {
        type: 'string',
        description: 'Comma-separated patterns to include (e.g., "src/, *.js, component")',
        optional: true
      },
      excludePatterns: {
        type: 'string',
        description: 'Comma-separated patterns to exclude (e.g., "node_modules/, *.min.js, test/")',
        optional: true
      }
    },
    required: ['query']
  }
};

export async function executeFileSearchTool(args: any): Promise<any> {
  try {
    // This is handled by the main process
    const result = await window.electronAPI.mcp?.callTool('search_files', args);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return result || { success: false, error: "No result received" };
  } catch (error) {
    console.error('[FILE-SEARCH-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}