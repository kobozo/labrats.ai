import { Tool } from '../types';

/**
 * MCP Tool definitions for Kanban Task Management
 * These tools provide comprehensive task management capabilities for AI agents
 */

export const getTasksByStatusTool: Tool = {
  name: 'get_tasks_by_status',
  description: 'Get all tasks filtered by workflow stage/status (backlog, todo, in-progress, review, done). Useful for viewing current work, backlog planning, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'The workflow stage to filter tasks by'
      },
      assignee: {
        type: 'string',
        description: 'Optional: Filter by assignee name (e.g., "Cortex", "Patchy")'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Optional: Filter by priority level'
      }
    },
    required: ['status']
  }
};

export const getTaskTool: Tool = {
  name: 'get_task',
  description: 'Get detailed information about a specific task including description, comments, file references, and linked tasks',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to retrieve (e.g., "TASK-1234567890")'
      }
    },
    required: ['taskId']
  }
};

export const createTaskTool: Tool = {
  name: 'create_task',
  description: 'Create a new task in the kanban board with specified details. Automatically generates a unique task ID.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The task title/summary (concise and descriptive)'
      },
      description: {
        type: 'string',
        description: 'Detailed description of the task including requirements, context, and acceptance criteria'
      },
      assignee: {
        type: 'string',
        description: 'Agent name to assign the task to (e.g., "Cortex", "Patchy", "Shiny")',
        default: 'LabRats'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Task priority level',
        default: 'medium'
      },
      type: {
        type: 'string',
        enum: ['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo'],
        description: 'Type of task',
        default: 'task'
      },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'Initial status for the task',
        default: 'backlog'
      },
      linkedTasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            type: { 
              type: 'string',
              enum: ['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on']
            }
          },
          required: ['taskId', 'type']
        },
        description: 'Optional: Tasks that this task is linked to (relationships)'
      }
    },
    required: ['title', 'description']
  }
};

export const updateTaskTool: Tool = {
  name: 'update_task',
  description: 'Update task details like title, description, priority, or type. Does not change status or assignee.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to update'
      },
      title: {
        type: 'string',
        description: 'New task title'
      },
      description: {
        type: 'string',
        description: 'New task description'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'New priority level'
      },
      type: {
        type: 'string',
        enum: ['task', 'bug', 'feature', 'documentation', 'technical-debt', 'todo'],
        description: 'New task type'
      }
    },
    required: ['taskId']
  }
};

export const moveAndAssignTaskTool: Tool = {
  name: 'move_and_assign_task',
  description: 'Move a task to a different status and optionally reassign it to a different agent in one operation. Efficient for workflow transitions.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to move'
      },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'New status for the task'
      },
      assignee: {
        type: 'string',
        description: 'Optional: New assignee for the task (agent name)'
      },
      comment: {
        type: 'string',
        description: 'Optional: Comment explaining the move/assignment'
      }
    },
    required: ['taskId', 'status']
  }
};

export const addTaskCommentTool: Tool = {
  name: 'add_task_comment',
  description: 'Add a comment to a task for communication, progress updates, and coordination between agents',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to comment on'
      },
      content: {
        type: 'string',
        description: 'The comment content (can include progress updates, questions, decisions)'
      },
      authorName: {
        type: 'string',
        description: 'Name of the comment author (your agent name)'
      }
    },
    required: ['taskId', 'content', 'authorName']
  }
};

export const getTaskCommentsTool: Tool = {
  name: 'get_task_comments',
  description: 'Get all comments for a specific task to understand context and communication history',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to get comments for'
      }
    },
    required: ['taskId']
  }
};

export const searchTasksTool: Tool = {
  name: 'search_tasks',
  description: 'Search for tasks by title, description, or content using text search. Useful for finding related work.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query to match against task titles and descriptions'
      },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'Optional: Limit search to specific status'
      },
      assignee: {
        type: 'string',
        description: 'Optional: Limit search to specific assignee'
      }
    },
    required: ['query']
  }
};

export const getBacklogTool: Tool = {
  name: 'get_backlog',
  description: 'Get all backlog tasks ordered by priority (high → medium → low). Essential for sprint planning and task prioritization.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Optional: Limit number of tasks returned (default: 50)',
        default: 50,
        minimum: 1,
        maximum: 200
      }
    }
  }
};

export const getMyTasksTool: Tool = {
  name: 'get_my_tasks',
  description: 'Get all tasks assigned to a specific agent. Use this to see your current workload.',
  inputSchema: {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        description: 'Name of the agent to get tasks for (e.g., "Cortex", "Patchy")'
      },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'Optional: Filter by status (e.g., "in-progress" for current work)'
      }
    },
    required: ['agentName']
  }
};

export const linkTasksTool: Tool = {
  name: 'link_tasks',
  description: 'Create or remove relationships between tasks (blocks, depends-on, etc.). Important for managing dependencies.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The source task ID'
      },
      linkedTaskId: {
        type: 'string',
        description: 'The target task ID to link/unlink'
      },
      linkType: {
        type: 'string',
        enum: ['blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on'],
        description: 'Type of relationship between tasks'
      },
      action: {
        type: 'string',
        enum: ['add', 'remove'],
        description: 'Whether to add or remove the link',
        default: 'add'
      }
    },
    required: ['taskId', 'linkedTaskId', 'linkType']
  }
};

export const getTaskStatsTool: Tool = {
  name: 'get_task_stats',
  description: 'Get overview statistics about tasks (counts by status, priority, assignee). Useful for project health monitoring.',
  inputSchema: {
    type: 'object',
    properties: {
      groupBy: {
        type: 'string',
        enum: ['status', 'priority', 'assignee', 'type'],
        description: 'How to group the statistics',
        default: 'status'
      }
    }
  }
};

// Export all tools as an array for easy registration
export const kanbanManagementTools = [
  getTasksByStatusTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  moveAndAssignTaskTool,
  addTaskCommentTool,
  getTaskCommentsTool,
  searchTasksTool,
  getBacklogTool,
  getMyTasksTool,
  linkTasksTool,
  getTaskStatsTool
];