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
        {
          name: 'dependency_query',
          description: 'Query dependencies for a specific file. Get information about what a file imports and exports, and what files depend on it.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the file to query (relative to project root)' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'dependency_path',
          description: 'Find the dependency path between two files. Shows how files are connected through imports.',
          inputSchema: {
            type: 'object',
            properties: {
              fromFile: { type: 'string', description: 'Source file path (relative to project root)' },
              toFile: { type: 'string', description: 'Target file path (relative to project root)' },
            },
            required: ['fromFile', 'toFile'],
          },
        },
        {
          name: 'dependency_stats',
          description: 'Get overall dependency statistics for the project. Shows most dependent files, circular dependencies, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              includeCircular: { type: 'boolean', description: 'Whether to include circular dependencies (default: true)' },
              topCount: { type: 'number', description: 'Number of top files to include (default: 10)' },
            },
            required: [],
          },
        },
        {
          name: 'dependency_impact',
          description: 'Analyze the impact of changes to a specific file. Shows which files would be affected by changes.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the file to analyze (relative to project root)' },
              maxDepth: { type: 'number', description: 'Maximum depth to analyze (default: 5)' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'circular_dependencies',
          description: 'Find all circular dependencies in the project. Critical for identifying potential issues and maintaining code quality.',
          inputSchema: {
            type: 'object',
            properties: {
              includeDetails: { type: 'boolean', description: 'Whether to include detailed information about each cycle (default: true)' },
              maxCycles: { type: 'number', description: 'Maximum number of cycles to return (default: 50)' },
            },
            required: [],
          },
        },
        
        // Kanban Task Management Tools
        {
          name: 'get_tasks_by_status',
          description: 'Get all tasks filtered by workflow stage/status (backlog, todo, in-progress, review, done). Essential for viewing current work and planning.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'], description: 'Workflow stage to filter by' },
              assignee: { type: 'string', description: 'Optional: Filter by assignee name' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Optional: Filter by priority' },
            },
            required: ['status'],
          },
        },
        {
          name: 'get_task',
          description: 'Get detailed information about a specific task including description, comments, and file references.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Unique task ID (e.g., "TASK-1234567890")' },
            },
            required: ['taskId'],
          },
        },
        {
          name: 'create_task',
          description: 'Create a new task in the kanban board. Automatically generates unique ID and timestamps.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Task title/summary' },
              description: { type: 'string', description: 'Detailed task description with requirements and context' },
              assignee: { type: 'string', description: 'Agent name to assign (default: "LabRats")' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level (default: "medium")' },
              type: { type: 'string', enum: ['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo'], description: 'Task type (default: "task")' },
              status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'], description: 'Initial status (default: "backlog")' },
            },
            required: ['title', 'description'],
          },
        },
        {
          name: 'update_task',
          description: 'Update task details like title, description, priority, or type. Does not change status or assignee.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Task ID to update' },
              title: { type: 'string', description: 'New title' },
              description: { type: 'string', description: 'New description' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'New priority' },
              type: { type: 'string', enum: ['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo'], description: 'New type' },
            },
            required: ['taskId'],
          },
        },
        {
          name: 'move_and_assign_task',
          description: 'Move task to different status and optionally reassign it. Efficient for workflow transitions.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Task ID to move' },
              status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'], description: 'New status' },
              assignee: { type: 'string', description: 'Optional: New assignee' },
              comment: { type: 'string', description: 'Optional: Transition comment' },
            },
            required: ['taskId', 'status'],
          },
        },
        {
          name: 'add_task_comment',
          description: 'Add a comment to a task for communication and progress tracking.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Task ID to comment on' },
              content: { type: 'string', description: 'Comment content' },
              authorName: { type: 'string', description: 'Your agent name' },
            },
            required: ['taskId', 'content', 'authorName'],
          },
        },
        {
          name: 'get_task_comments',
          description: 'Get all comments for a task to understand context and communication history.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Task ID to get comments for' },
            },
            required: ['taskId'],
          },
        },
        {
          name: 'search_tasks',
          description: 'Search tasks by title/description content. Useful for finding related work.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'], description: 'Optional: Limit to status' },
              assignee: { type: 'string', description: 'Optional: Limit to assignee' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_backlog',
          description: 'Get backlog tasks ordered by priority (high → medium → low). Essential for sprint planning.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Optional: Max tasks to return (default: 50)', minimum: 1, maximum: 200 },
            },
            required: [],
          },
        },
        {
          name: 'get_my_tasks',
          description: 'Get all tasks assigned to a specific agent. Use to see your current workload.',
          inputSchema: {
            type: 'object',
            properties: {
              agentName: { type: 'string', description: 'Agent name to get tasks for' },
              status: { type: 'string', enum: ['backlog', 'todo', 'in-progress', 'review', 'done'], description: 'Optional: Filter by status' },
            },
            required: ['agentName'],
          },
        },
        {
          name: 'link_tasks',
          description: 'Create or remove relationships between tasks. Important for dependency management.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Source task ID' },
              linkedTaskId: { type: 'string', description: 'Target task ID to link/unlink' },
              linkType: { type: 'string', enum: ['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on'], description: 'Relationship type' },
              action: { type: 'string', enum: ['add', 'remove'], description: 'Add or remove link (default: "add")' },
            },
            required: ['taskId', 'linkedTaskId', 'linkType'],
          },
        },
        {
          name: 'get_task_stats',
          description: 'Get task statistics grouped by status, priority, assignee, or type. Useful for project health monitoring.',
          inputSchema: {
            type: 'object',
            properties: {
              groupBy: { type: 'string', enum: ['status', 'priority', 'assignee', 'type'], description: 'Grouping method (default: "status")' },
            },
            required: [],
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
      dependency_query: z.object({
        filePath: z.string().describe('Path to the file to query (relative to project root)'),
      }),
      dependency_path: z.object({
        fromFile: z.string().describe('Source file path (relative to project root)'),
        toFile: z.string().describe('Target file path (relative to project root)'),
      }),
      dependency_stats: z.object({
        includeCircular: z.boolean().optional().describe('Whether to include circular dependencies'),
        topCount: z.number().optional().describe('Number of top files to include'),
      }),
      dependency_impact: z.object({
        filePath: z.string().describe('Path to the file to analyze (relative to project root)'),
        maxDepth: z.number().optional().describe('Maximum depth to analyze'),
      }),
      circular_dependencies: z.object({
        includeDetails: z.boolean().optional().describe('Whether to include detailed information about each cycle'),
        maxCycles: z.number().optional().describe('Maximum number of cycles to return'),
      }),
      
      // Kanban Task Management Tool Schemas
      get_tasks_by_status: z.object({
        status: z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']).describe('Workflow stage to filter by'),
        assignee: z.string().optional().describe('Optional: Filter by assignee name'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Optional: Filter by priority'),
      }),
      get_task: z.object({
        taskId: z.string().describe('Unique task ID (e.g., "TASK-1234567890")'),
      }),
      create_task: z.object({
        title: z.string().describe('Task title/summary'),
        description: z.string().describe('Detailed task description with requirements and context'),
        assignee: z.string().optional().describe('Agent name to assign (default: "LabRats")'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority level (default: "medium")'),
        type: z.enum(['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo']).optional().describe('Task type (default: "task")'),
        status: z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']).optional().describe('Initial status (default: "backlog")'),
      }),
      update_task: z.object({
        taskId: z.string().describe('Task ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
        type: z.enum(['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo']).optional().describe('New type'),
      }),
      move_and_assign_task: z.object({
        taskId: z.string().describe('Task ID to move'),
        status: z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']).describe('New status'),
        assignee: z.string().optional().describe('Optional: New assignee'),
        comment: z.string().optional().describe('Optional: Transition comment'),
      }),
      add_task_comment: z.object({
        taskId: z.string().describe('Task ID to comment on'),
        content: z.string().describe('Comment content'),
        authorName: z.string().describe('Your agent name'),
      }),
      get_task_comments: z.object({
        taskId: z.string().describe('Task ID to get comments for'),
      }),
      search_tasks: z.object({
        query: z.string().describe('Search query'),
        status: z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']).optional().describe('Optional: Limit to status'),
        assignee: z.string().optional().describe('Optional: Limit to assignee'),
      }),
      get_backlog: z.object({
        limit: z.number().min(1).max(200).optional().describe('Optional: Max tasks to return (default: 50)'),
      }),
      get_my_tasks: z.object({
        agentName: z.string().describe('Agent name to get tasks for'),
        status: z.enum(['backlog', 'todo', 'in-progress', 'review', 'done']).optional().describe('Optional: Filter by status'),
      }),
      link_tasks: z.object({
        taskId: z.string().describe('Source task ID'),
        linkedTaskId: z.string().describe('Target task ID to link/unlink'),
        linkType: z.enum(['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on']).describe('Relationship type'),
        action: z.enum(['add', 'remove']).optional().describe('Add or remove link (default: "add")'),
      }),
      get_task_stats: z.object({
        groupBy: z.enum(['status', 'priority', 'assignee', 'type']).optional().describe('Grouping method (default: "status")'),
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