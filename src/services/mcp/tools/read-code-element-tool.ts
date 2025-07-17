import { Tool } from '../types';

export const readCodeElementTool: Tool = {
  name: 'read_code_element',
  description: 'Read the specific code element (function, class, method) that contains a given line number. This is more efficient than reading entire files.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file (relative to project root)'
      },
      lineNumber: {
        type: 'number',
        description: 'Line number to find the containing code element for'
      },
      searchQuery: {
        type: 'string',
        description: 'Optional search query to highlight within the code element',
        optional: true
      },
      contextLines: {
        type: 'number',
        description: 'Number of context lines to include if no code element is found (default: 5)',
        default: 5,
        optional: true
      }
    },
    required: ['filePath', 'lineNumber']
  }
};

export async function executeReadCodeElementTool(args: any): Promise<any> {
  try {
    // This is handled by the main process
    const result = await window.electronAPI.mcp?.callTool('read_code_element', args);
    if (typeof result === 'string') {
      return JSON.parse(result);
    }
    return result || { success: false, error: "No result received" };
  } catch (error) {
    console.error('[READ-CODE-ELEMENT-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}