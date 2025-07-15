import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Creates LangChain tools for MCP integration
 * Following LangChain's tool patterns from https://js.langchain.com/docs/how_to/tool_calling
 */
export function createMcpTools() {
  const tools: any[] = [];

  // Only create tools if we're in the renderer process with electronAPI
  if (typeof window === 'undefined' || !window.electronAPI?.mcp) {
    return tools;
  }

  // Define the schema for list_files tool
  const listFilesSchema = z.object({
    path: z.string()
      .default('.')
      .describe('Directory path relative to project root. Use "." for root, "src" for src folder, etc.'),
    recursive: z.boolean()
      .default(false)
      .describe('Whether to list files recursively in subdirectories'),
    include_hidden: z.boolean()
      .default(false)
      .describe('Whether to include hidden files (starting with .)'),
    pattern: z.string()
      .optional()
      .describe('Optional glob pattern to filter files (e.g., "*.ts" for TypeScript files)')
  });

  // Create the list_files tool using the new pattern
  const listFilesTool = tool(
    async ({ path, recursive, include_hidden, pattern }) => {
      try {
        console.log('[MCP-TOOLS] Calling list_files with:', { path, recursive, include_hidden, pattern });
        const response = await window.electronAPI.mcp!.callTool('list_files', { 
          path: path || '.', 
          recursive: recursive || false, 
          include_hidden: include_hidden || false, 
          pattern 
        });
        
        if (response.success && response.result?.content && response.result.content.length > 0) {
          const result = response.result.content[0].text || 'No result';
          console.log('[MCP-TOOLS] Tool result received, length:', result.length);
          return result;
        } else if (!response.success) {
          const errorMsg = response.error || 'Unknown error';
          console.error('[MCP-TOOLS] Tool call failed:', errorMsg);
          return `Error: ${errorMsg}`;
        }
        
        return 'No files found in the specified directory.';
      } catch (error) {
        console.error('[MCP-TOOLS] Error calling list_files:', error);
        return `Error accessing files: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },
    {
      name: 'list_files',
      description: 'List files and directories in a project directory. Use this to explore the project structure, see what files exist, find files matching patterns, and understand the codebase organization.',
      schema: listFilesSchema,
    }
  );

  tools.push(listFilesTool);

  // Future tools can be added here following the same pattern:
  // - read_file: Read the contents of a specific file
  // - search_files: Search for text within files
  // - write_file: Create or update a file
  // - git_status: Get the git status of the project
  // etc.

  console.log('[MCP-TOOLS] Created', tools.length, 'MCP tools');
  console.log('[MCP-TOOLS] Tool details:', tools.map(t => ({ 
    name: t.name, 
    description: t.description?.substring(0, 50) + '...' 
  })));
  return tools;
}

/**
 * Check if MCP is available
 */
export async function isMcpAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.electronAPI?.mcp) {
    console.log('[MCP-TOOLS] MCP API not available in window');
    return false;
  }

  try {
    const status = await window.electronAPI.mcp.getStatus();
    console.log('[MCP-TOOLS] MCP status:', status);
    return status.ready;
  } catch (error) {
    console.error('[MCP-TOOLS] Error checking MCP status:', error);
    return false;
  }
}