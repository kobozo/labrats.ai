import { Task, WorkflowStage, TaskComment, TaskLinkType, TaskLink } from '../../../types/kanban';
import { KanbanStorageService } from '../../kanban-storage-service';
import { agents } from '../../../config/agents';

// Simple Tool interface for documentation purposes
interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * MCP Tools for Kanban Task Management
 * Provides comprehensive task management capabilities for AI agents
 */

// Get tasks by status (backlog, todo, in-progress, review, done)
export const getTasksByStatus: Tool = {
  name: 'get_tasks_by_status',
  description: 'Get all tasks filtered by workflow stage/status. Useful for viewing backlog, current work, etc.',
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
        description: 'Optional: Filter by assignee name'
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

// Get a specific task by ID
export const getTask: Tool = {
  name: 'get_task',
  description: 'Get detailed information about a specific task including description, comments, and file references',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to retrieve'
      }
    },
    required: ['taskId']
  }
};

// Create a new task
export const createTask: Tool = {
  name: 'create_task',
  description: 'Create a new task in the kanban board with specified details',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The task title/summary'
      },
      description: {
        type: 'string',
        description: 'Detailed description of the task'
      },
      assignee: {
        type: 'string',
        description: 'Agent name to assign the task to'
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
        description: 'Optional: Tasks that this task is linked to'
      }
    },
    required: ['title', 'description']
  }
};

// Update task details
export const updateTask: Tool = {
  name: 'update_task',
  description: 'Update task details like title, description, priority, or type',
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

// Move task and optionally reassign (combined operation to save tokens)
export const moveAndAssignTask: Tool = {
  name: 'move_and_assign_task',
  description: 'Move a task to a different status and optionally reassign it to a different agent in one operation',
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
        description: 'Optional: New assignee for the task'
      },
      comment: {
        type: 'string',
        description: 'Optional: Comment explaining the move/assignment'
      }
    },
    required: ['taskId', 'status']
  }
};

// Add comment to task
export const addTaskComment: Tool = {
  name: 'add_task_comment',
  description: 'Add a comment to a task for communication and progress tracking',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The unique ID of the task to comment on'
      },
      content: {
        type: 'string',
        description: 'The comment content'
      },
      authorName: {
        type: 'string',
        description: 'Name of the comment author (agent name)'
      }
    },
    required: ['taskId', 'content', 'authorName']
  }
};

// Get task comments
export const getTaskComments: Tool = {
  name: 'get_task_comments',
  description: 'Get all comments for a specific task',
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

// Search tasks
export const searchTasks: Tool = {
  name: 'search_tasks',
  description: 'Search for tasks by title, description, or content using text search',
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

// Get backlog with priority ordering
export const getBacklog: Tool = {
  name: 'get_backlog',
  description: 'Get all backlog tasks ordered by priority (high → medium → low)',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Optional: Limit number of tasks returned',
        default: 50
      }
    }
  }
};

// Get my assigned tasks (for specific agent)
export const getMyTasks: Tool = {
  name: 'get_my_tasks',
  description: 'Get all tasks assigned to a specific agent',
  inputSchema: {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        description: 'Name of the agent to get tasks for'
      },
      status: {
        type: 'string',
        enum: ['backlog', 'todo', 'in-progress', 'review', 'done'],
        description: 'Optional: Filter by status'
      }
    },
    required: ['agentName']
  }
};

// Link/unlink tasks
export const linkTasks: Tool = {
  name: 'link_tasks',
  description: 'Create or remove relationships between tasks (blocks, depends-on, etc.)',
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
        description: 'Type of relationship'
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

// Get task statistics
export const getTaskStats: Tool = {
  name: 'get_task_stats',
  description: 'Get overview statistics about tasks (counts by status, priority, assignee)',
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

/**
 * Implementation functions for the MCP tools
 */

export class KanbanMCPHandler {
  private storageService: KanbanStorageService;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.storageService = new KanbanStorageService(projectPath);
  }

  async handleGetTasksByStatus(args: { status: WorkflowStage; assignee?: string; priority?: 'low' | 'medium' | 'high' }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      let filteredTasks = tasks.filter(task => task.status === args.status);
      
      if (args.assignee) {
        filteredTasks = filteredTasks.filter(task => task.assignee === args.assignee);
      }
      
      if (args.priority) {
        filteredTasks = filteredTasks.filter(task => task.priority === args.priority);
      }

      return {
        success: true,
        data: {
          status: args.status,
          count: filteredTasks.length,
          tasks: filteredTasks.map(task => ({
            id: task.id,
            title: task.title,
            assignee: task.assignee,
            priority: task.priority,
            type: task.type,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleGetTask(args: { taskId: string }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      return {
        success: true,
        data: task
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleCreateTask(args: {
    title: string;
    description: string;
    assignee?: string;
    priority?: 'low' | 'medium' | 'high';
    type?: 'feature' | 'bug' | 'task' | 'agent-task' | 'hotfix' | 'todo';
    status?: WorkflowStage;
    linkedTasks?: TaskLink[];
  }) {
    try {
      const taskId = `TASK-${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      const task: Task = {
        id: taskId,
        title: args.title,
        description: args.description,
        assignee: args.assignee || 'LabRats',
        priority: args.priority || 'medium',
        type: args.type || 'task',
        status: args.status || 'backlog',
        createdBy: 'agent',
        primaryRats: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        projectPath: this.projectPath,
        linkedTasks: args.linkedTasks || []
      };

      await this.storageService.updateTask('main-board', task);

      return {
        success: true,
        data: {
          taskId: task.id,
          message: `Task "${task.title}" created successfully`,
          task: task
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleUpdateTask(args: {
    taskId: string;
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    type?: 'feature' | 'bug' | 'task' | 'agent-task' | 'hotfix' | 'todo';
  }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      const updatedTask: Task = {
        ...task,
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
        ...(args.priority && { priority: args.priority }),
        ...(args.type && { type: args.type }),
        updatedAt: new Date().toISOString()
      };

      await this.storageService.updateTask('main-board', updatedTask);

      return {
        success: true,
        data: {
          message: `Task "${updatedTask.title}" updated successfully`,
          task: updatedTask
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleMoveAndAssignTask(args: {
    taskId: string;
    status: WorkflowStage;
    assignee?: string;
    comment?: string;
  }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      const updatedTask: Task = {
        ...task,
        status: args.status,
        ...(args.assignee && { assignee: args.assignee }),
        updatedAt: new Date().toISOString()
      };

      // Add comment if provided
      if (args.comment) {
        const comment: TaskComment = {
          id: `comment-${Date.now()}`,
          taskId: args.taskId,
          authorName: args.assignee || 'System',
          authorType: 'agent',
          content: args.comment,
          timestamp: new Date().toISOString()
        };
        
        updatedTask.comments = [...(task.comments || []), comment];
      }

      await this.storageService.updateTask('main-board', updatedTask);

      return {
        success: true,
        data: {
          message: `Task "${updatedTask.title}" moved to ${args.status}${args.assignee ? ` and assigned to ${args.assignee}` : ''}`,
          task: updatedTask
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to move/assign task: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleAddTaskComment(args: {
    taskId: string;
    content: string;
    authorName: string;
  }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      const comment: TaskComment = {
        id: `comment-${Date.now()}`,
        taskId: args.taskId,
        authorName: args.authorName,
        authorType: 'agent',
        content: args.content,
        timestamp: new Date().toISOString(),
        agentColor: agents.find(a => a.name === args.authorName)?.colorAccent
      };

      const updatedTask: Task = {
        ...task,
        comments: [...(task.comments || []), comment],
        updatedAt: new Date().toISOString()
      };

      await this.storageService.updateTask('main-board', updatedTask);

      return {
        success: true,
        data: {
          message: `Comment added to task "${task.title}"`,
          comment: comment
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add comment: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleGetTaskComments(args: { taskId: string }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      return {
        success: true,
        data: {
          taskTitle: task.title,
          comments: task.comments || []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get comments: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleSearchTasks(args: {
    query: string;
    status?: WorkflowStage;
    assignee?: string;
  }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const queryLower = args.query.toLowerCase();
      
      let filteredTasks = tasks.filter(task => 
        task.title.toLowerCase().includes(queryLower) ||
        task.description.toLowerCase().includes(queryLower)
      );

      if (args.status) {
        filteredTasks = filteredTasks.filter(task => task.status === args.status);
      }

      if (args.assignee) {
        filteredTasks = filteredTasks.filter(task => task.assignee === args.assignee);
      }

      return {
        success: true,
        data: {
          query: args.query,
          count: filteredTasks.length,
          tasks: filteredTasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description.substring(0, 200) + (task.description.length > 200 ? '...' : ''),
            status: task.status,
            assignee: task.assignee,
            priority: task.priority,
            type: task.type
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleGetBacklog(args: { limit?: number }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const backlogTasks = tasks.filter(task => task.status === 'backlog');
      
      // Sort by priority (high > medium > low) and then by updated date
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      backlogTasks.sort((a, b) => {
        const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      const limitedTasks = args.limit ? backlogTasks.slice(0, args.limit) : backlogTasks;

      return {
        success: true,
        data: {
          total: backlogTasks.length,
          showing: limitedTasks.length,
          tasks: limitedTasks.map(task => ({
            id: task.id,
            title: task.title,
            assignee: task.assignee,
            priority: task.priority,
            type: task.type,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get backlog: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleGetMyTasks(args: { agentName: string; status?: WorkflowStage }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      let myTasks = tasks.filter(task => task.assignee === args.agentName);
      
      if (args.status) {
        myTasks = myTasks.filter(task => task.status === args.status);
      }

      return {
        success: true,
        data: {
          agent: args.agentName,
          status: args.status || 'all',
          count: myTasks.length,
          tasks: myTasks.map(task => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            type: task.type,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
          }))
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get tasks for ${args.agentName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleLinkTasks(args: {
    taskId: string;
    linkedTaskId: string;
    linkType: string;
    action?: 'add' | 'remove';
  }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const task = tasks.find(t => t.id === args.taskId);
      
      if (!task) {
        return {
          success: false,
          error: `Task with ID ${args.taskId} not found`
        };
      }

      // Verify linked task exists
      const linkedTask = tasks.find(t => t.id === args.linkedTaskId);
      if (!linkedTask) {
        return {
          success: false,
          error: `Linked task with ID ${args.linkedTaskId} not found`
        };
      }

      const currentLinks = task.linkedTasks || [];
      const action = args.action || 'add';

      let updatedLinks;
      if (action === 'add') {
        // Check if link already exists
        const existingLink = currentLinks.find(link => 
          link.taskId === args.linkedTaskId && link.type === args.linkType
        );
        if (existingLink) {
          return {
            success: false,
            error: `Link already exists between tasks`
          };
        }
        updatedLinks = [...currentLinks, { taskId: args.linkedTaskId, type: args.linkType as any }];
      } else {
        updatedLinks = currentLinks.filter(link => 
          !(link.taskId === args.linkedTaskId && link.type === args.linkType)
        );
      }

      const updatedTask: Task = {
        ...task,
        linkedTasks: updatedLinks,
        updatedAt: new Date().toISOString()
      };

      await this.storageService.updateTask('main-board', updatedTask);

      return {
        success: true,
        data: {
          message: `${action === 'add' ? 'Added' : 'Removed'} ${args.linkType} link between "${task.title}" and "${linkedTask.title}"`,
          task: updatedTask
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to ${args.action || 'add'} task link: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async handleGetTaskStats(args: { groupBy?: string }) {
    try {
      const tasks = await this.storageService.getTasks('main-board');
      const groupBy = args.groupBy || 'status';
      
      const stats: Record<string, number> = {};
      
      tasks.forEach(task => {
        let key: string;
        switch (groupBy) {
          case 'status':
            key = task.status;
            break;
          case 'priority':
            key = task.priority;
            break;
          case 'assignee':
            key = task.assignee;
            break;
          case 'type':
            key = task.type;
            break;
          default:
            key = task.status;
        }
        
        stats[key] = (stats[key] || 0) + 1;
      });

      return {
        success: true,
        data: {
          total: tasks.length,
          groupBy: groupBy,
          stats: stats
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get task stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}