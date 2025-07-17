import { Tool } from '../types';

export const replaceTextTool: Tool = {
  name: 'replace_in_file',
  description: 'Replace text content within a specific file. Supports case sensitivity, regex patterns, and replace all or first occurrence only.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file (relative to project root)'
      },
      searchText: {
        type: 'string',
        description: 'Text to search for and replace'
      },
      replaceText: {
        type: 'string',
        description: 'Text to replace with',
        default: ''
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether the search should be case sensitive',
        default: false
      },
      useRegex: {
        type: 'boolean',
        description: 'Whether to treat searchText as a regular expression',
        default: false
      },
      replaceAll: {
        type: 'boolean',
        description: 'Whether to replace all occurrences (true) or just the first one (false)',
        default: true
      }
    },
    required: ['filePath', 'searchText']
  }
};

export async function executeReplaceTextTool(args: any): Promise<any> {
  try {
    // This is handled by the main process
    const result = await window.electronAPI.mcp?.callTool('replace_in_file', args);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return result || { success: false, error: "No result received" };
  } catch (error) {
    console.error('[REPLACE-TEXT-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}