/**
 * LangChain MCP Client Integration
 * Provides tools for LangChain to interact with the IDE workspace
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

class LangChainMcpClient {
  private tools: any[] = [];
  private workspaceRoot: string | null = null;

  async connect(workspaceRoot: string): Promise<void> {
    if (this.tools.length > 0) {
      await this.disconnect();
    }

    console.log('[LANGCHAIN-MCP] Connecting to MCP server for workspace:', workspaceRoot);
    this.workspaceRoot = workspaceRoot;

    try {
      // Create tools directly for LangChain
      this.tools = [
        {
          name: 'listFiles',
          description: 'List files and directories in a given path. Use this when asked about project structure, files in a directory, or to explore the workspace. Supports recursive listing.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory path relative to workspace root (use "." for root)' },
              recursive: { type: 'boolean', description: 'Whether to list files recursively in subdirectories (default: false)' },
            },
            required: ['path'],
          },
        },
        {
          name: 'readFile',
          description: 'Read contents from a project file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path from workspace root' },
              start: { type: 'integer', description: 'Start byte position (optional)' },
              end: { type: 'integer', description: 'End byte position (optional)' },
            },
            required: ['path'],
          },
        },
        {
          name: 'replaceText',
          description: 'Search and replace text in a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path from workspace root' },
              oldText: { type: 'string', description: 'Exact text to search for' },
              newText: { type: 'string', description: 'Text to replace with' },
            },
            required: ['path', 'oldText', 'newText'],
          },
        },
        {
          name: 'execCommand',
          description: 'Execute an allowed CLI command in the workspace',
          inputSchema: {
            type: 'object',
            properties: {
              cmd: { type: 'string', description: 'Command to execute' },
              cwd: { type: 'string', description: 'Working directory relative to workspace' },
              timeoutSec: { type: 'integer', description: 'Timeout in seconds (max 600)' },
            },
            required: ['cmd', 'cwd', 'timeoutSec'],
          },
        },
        {
          name: 'search_code',
          description: 'Search for code using natural language queries. Find functions, classes, methods, and other code elements semantically.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Natural language search query' },
              limit: { type: 'number', description: 'Maximum number of results (default: 10, max: 50)' },
              type: { type: 'string', description: 'Filter by code element type', enum: ['function', 'class', 'method', 'interface', 'type', 'variable', 'import', 'export'] },
              language: { type: 'string', description: 'Filter by programming language' },
            },
            required: ['query'],
          },
        },
        {
          name: 'find_similar_code',
          description: 'Find code similar to a given code snippet. Useful for finding duplicates, similar implementations, or related code patterns.',
          inputSchema: {
            type: 'object',
            properties: {
              codeSnippet: { type: 'string', description: 'The code snippet to find similar code for' },
              limit: { type: 'number', description: 'Maximum number of results (default: 10, max: 50)' },
              minSimilarity: { type: 'number', description: 'Minimum similarity score (0-1, default: 0.8)' },
            },
            required: ['codeSnippet'],
          },
        },
        {
          name: 'explore_codebase',
          description: 'Explore and navigate the codebase structure. Get information about files, classes, functions, and their relationships.',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'The exploration action', enum: ['list_files', 'list_functions', 'list_classes', 'get_file_structure', 'get_imports', 'get_exports'] },
              filePath: { type: 'string', description: 'File path to explore (required for file-specific actions)' },
              pattern: { type: 'string', description: 'Filter pattern for listing' },
              language: { type: 'string', description: 'Filter by programming language' },
            },
            required: ['action'],
          },
        },
        {
          name: 'code_vectorization_status',
          description: 'Get the status of code vectorization including progress, statistics, and control operations.',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'The action to perform', enum: ['get_status', 'start_vectorization', 'stop_watching', 'force_reindex'] },
              filePatterns: { type: 'array', description: 'File patterns to vectorize (only for start_vectorization)' },
            },
            required: ['action'],
          },
        },
        {
          name: 'search_files',
          description: 'Search for files by name and path. Returns files that match the search query in their filename or path.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query to match against file names and paths (case-insensitive)' },
              limit: { type: 'number', description: 'Maximum number of results to return (default: 50, max: 200)' },
              includePatterns: { type: 'string', description: 'Comma-separated patterns to include (e.g., "src/, *.js, component")' },
              excludePatterns: { type: 'string', description: 'Comma-separated patterns to exclude (e.g., "node_modules/, *.min.js, test/")' },
            },
            required: ['query'],
          },
        },
        {
          name: 'search_in_files',
          description: 'Search for text content within files. Supports case sensitivity, regex patterns, and include/exclude filters. Returns matches with line numbers and context.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query to find within file contents' },
              caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive (default: false)' },
              useRegex: { type: 'boolean', description: 'Whether to treat the query as a regular expression (default: false)' },
              limit: { type: 'number', description: 'Maximum number of files to search (default: 100, max: 500)' },
              maxMatchesPerFile: { type: 'number', description: 'Maximum number of matches to return per file (default: 10, max: 50)' },
              includePatterns: { type: 'string', description: 'Comma-separated patterns to include files (e.g., "src/, *.js, component")' },
              excludePatterns: { type: 'string', description: 'Comma-separated patterns to exclude files (e.g., "node_modules/, *.min.js, test/")' },
            },
            required: ['query'],
          },
        },
        {
          name: 'replace_in_file',
          description: 'Replace text content within a specific file. Supports case sensitivity, regex patterns, and replace all or first occurrence only.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the file (relative to project root)' },
              searchText: { type: 'string', description: 'Text to search for and replace' },
              replaceText: { type: 'string', description: 'Text to replace with (default: empty string)' },
              caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive (default: false)' },
              useRegex: { type: 'boolean', description: 'Whether to treat searchText as a regular expression (default: false)' },
              replaceAll: { type: 'boolean', description: 'Whether to replace all occurrences (true) or just the first one (false, default: true)' },
            },
            required: ['filePath', 'searchText'],
          },
        },
        {
          name: 'read_code_element',
          description: 'Read the specific code element (function, class, method) that contains a given line number. More efficient than reading entire files.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the file (relative to project root)' },
              lineNumber: { type: 'number', description: 'Line number to find the containing code element for' },
              searchQuery: { type: 'string', description: 'Optional search query to highlight within the code element' },
              contextLines: { type: 'number', description: 'Number of context lines if no element found (default: 5)' },
            },
            required: ['filePath', 'lineNumber'],
          },
        },
        {
          name: 'search_with_context',
          description: 'Search for text within files and get the containing code element context. Combines search with code parsing for better understanding.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query to find within file contents' },
              caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive (default: false)' },
              useRegex: { type: 'boolean', description: 'Whether to treat the query as a regular expression (default: false)' },
              limit: { type: 'number', description: 'Maximum number of files to search (default: 50)' },
              maxMatchesPerFile: { type: 'number', description: 'Maximum matches per file (default: 5)' },
              includeCodeContext: { type: 'boolean', description: 'Whether to include code element context (default: true)' },
              includePatterns: { type: 'string', description: 'Comma-separated patterns to include files' },
              excludePatterns: { type: 'string', description: 'Comma-separated patterns to exclude files' },
            },
            required: ['query'],
          },
        },
      ];
      
      console.log('[LANGCHAIN-MCP] Connected. Available tools:', this.tools.map(t => t.name));
    } catch (error) {
      console.error('[LANGCHAIN-MCP] Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.tools = [];
    this.workspaceRoot = null;
    console.log('[LANGCHAIN-MCP] Disconnected');
  }

  /**
   * Get tools formatted for LangChain
   */
  getLangChainTools(): any[] {
    if (!this.workspaceRoot) {
      return [];
    }

    // Convert tool schemas to Zod schemas
    const toolSchemas: Record<string, any> = {
      listFiles: z.object({
        path: z.string().describe('Directory path relative to workspace root (use "." for root)'),
        recursive: z.boolean().optional().describe('Whether to list files recursively in subdirectories'),
      }),
      readFile: z.object({
        path: z.string().describe('Relative path from workspace root'),
        start: z.number().optional().describe('Start byte position'),
        end: z.number().optional().describe('End byte position'),
      }),
      replaceText: z.object({
        path: z.string().describe('Relative path from workspace root'),
        oldText: z.string().describe('Exact text to search for'),
        newText: z.string().describe('Text to replace with'),
      }),
      execCommand: z.object({
        cmd: z.string().describe('Command to execute'),
        cwd: z.string().describe('Working directory relative to workspace'),
        timeoutSec: z.number().max(600).describe('Timeout in seconds'),
      }),
      search_code: z.object({
        query: z.string().describe('Natural language search query'),
        limit: z.number().optional().describe('Maximum number of results'),
        type: z.enum(['function', 'class', 'method', 'interface', 'type', 'variable', 'import', 'export']).optional().describe('Filter by code element type'),
        language: z.string().optional().describe('Filter by programming language'),
      }),
      find_similar_code: z.object({
        codeSnippet: z.string().describe('The code snippet to find similar code for'),
        limit: z.number().optional().describe('Maximum number of results'),
        minSimilarity: z.number().min(0).max(1).optional().describe('Minimum similarity score'),
      }),
      explore_codebase: z.object({
        action: z.enum(['list_files', 'list_functions', 'list_classes', 'get_file_structure', 'get_imports', 'get_exports']).describe('The exploration action'),
        filePath: z.string().optional().describe('File path to explore'),
        pattern: z.string().optional().describe('Filter pattern for listing'),
        language: z.string().optional().describe('Filter by programming language'),
      }),
      code_vectorization_status: z.object({
        action: z.enum(['get_status', 'start_vectorization', 'stop_watching', 'force_reindex']).describe('The action to perform'),
        filePatterns: z.array(z.string()).optional().describe('File patterns to vectorize'),
      }),
      search_files: z.object({
        query: z.string().describe('Search query to match against file names and paths (case-insensitive)'),
        limit: z.number().optional().describe('Maximum number of results to return'),
        includePatterns: z.string().optional().describe('Comma-separated patterns to include'),
        excludePatterns: z.string().optional().describe('Comma-separated patterns to exclude'),
      }),
      search_in_files: z.object({
        query: z.string().describe('Search query to find within file contents'),
        caseSensitive: z.boolean().optional().describe('Whether the search should be case sensitive'),
        useRegex: z.boolean().optional().describe('Whether to treat the query as a regular expression'),
        limit: z.number().optional().describe('Maximum number of files to search'),
        maxMatchesPerFile: z.number().optional().describe('Maximum number of matches to return per file'),
        includePatterns: z.string().optional().describe('Comma-separated patterns to include files'),
        excludePatterns: z.string().optional().describe('Comma-separated patterns to exclude files'),
      }),
      replace_in_file: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
        searchText: z.string().describe('Text to search for and replace'),
        replaceText: z.string().optional().describe('Text to replace with'),
        caseSensitive: z.boolean().optional().describe('Whether the search should be case sensitive'),
        useRegex: z.boolean().optional().describe('Whether to treat searchText as a regular expression'),
        replaceAll: z.boolean().optional().describe('Whether to replace all occurrences'),
      }),
      read_code_element: z.object({
        filePath: z.string().describe('Path to the file (relative to project root)'),
        lineNumber: z.number().describe('Line number to find the containing code element for'),
        searchQuery: z.string().optional().describe('Optional search query to highlight'),
        contextLines: z.number().optional().describe('Number of context lines if no element found'),
      }),
      search_with_context: z.object({
        query: z.string().describe('Search query to find within file contents'),
        caseSensitive: z.boolean().optional().describe('Whether the search should be case sensitive'),
        useRegex: z.boolean().optional().describe('Whether to treat the query as a regular expression'),
        limit: z.number().optional().describe('Maximum number of files to search'),
        maxMatchesPerFile: z.number().optional().describe('Maximum matches per file'),
        includeCodeContext: z.boolean().optional().describe('Whether to include code element context'),
        includePatterns: z.string().optional().describe('Comma-separated patterns to include files'),
        excludePatterns: z.string().optional().describe('Comma-separated patterns to exclude files'),
      }),
    };

    // Create LangChain tools
    return this.tools.map(tool => 
      new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: toolSchemas[tool.name],
        func: async (input: any) => {
          try {
            if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
              // Call the MCP server via IPC
              const result = await window.electronAPI.mcp.callTool(tool.name, input);
              return result;
            } else {
              // Fallback for testing
              console.log(`[LANGCHAIN-MCP] Tool ${tool.name} called with:`, input);
              return `Tool ${tool.name} executed with input: ${JSON.stringify(input)}`;
            }
          } catch (error) {
            console.error(`[LANGCHAIN-MCP] Tool ${tool.name} error:`, error);
            throw error;
          }
        },
      })
    );
  }

  isConnected(): boolean {
    return this.tools.length > 0 && this.workspaceRoot !== null;
  }
}

// Export singleton instance
export const langchainMcpClient = new LangChainMcpClient();