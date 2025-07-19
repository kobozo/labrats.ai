# MCP Kanban Task Management Tools

## Overview

This document describes the comprehensive MCP (Model Context Protocol) tools available for managing kanban tasks within the LabRats.AI system. These tools enable AI agents to create, update, assign, move, and comment on tasks in the kanban board.

## Workflow Stages

The kanban board uses a simplified 5-stage workflow:

- **backlog**: Ideas and planned work waiting for prioritization
- **todo**: Approved work ready to be started  
- **in-progress**: Work currently being done
- **review**: Work completed and awaiting review
- **done**: Completed and approved work

## Task Priority Levels

- **high**: Critical work that blocks other tasks
- **medium**: Standard priority work (default)
- **low**: Nice-to-have improvements and minor tasks

## Task Types

- **task**: General work item (default)
- **bug**: Bug fixes and error corrections
- **feature**: New functionality or capabilities
- **documentation**: Documentation updates and creation
- **technical-debt**: Code improvements and refactoring
- **todo**: Tasks automatically created from code TODO comments

## Available Tools

### 1. `get_tasks_by_status`

Get all tasks filtered by workflow stage/status. Essential for viewing current work and planning.

**Parameters:**
- `status` (required): Workflow stage ('backlog', 'todo', 'in-progress', 'review', 'done')
- `assignee` (optional): Filter by assignee name
- `priority` (optional): Filter by priority ('low', 'medium', 'high')

**Example:**
```javascript
// Get all tasks in progress
await callTool('get_tasks_by_status', { status: 'in-progress' });

// Get high priority backlog items
await callTool('get_tasks_by_status', { 
  status: 'backlog', 
  priority: 'high' 
});

// Get Cortex's current work
await callTool('get_tasks_by_status', { 
  status: 'in-progress', 
  assignee: 'Cortex' 
});
```

### 2. `get_task`

Get detailed information about a specific task including description, comments, and file references.

**Parameters:**
- `taskId` (required): Unique task ID (e.g., "TASK-1234567890")

**Example:**
```javascript
await callTool('get_task', { taskId: 'TASK-1752919950543339' });
```

### 3. `create_task`

Create a new task in the kanban board. Automatically generates unique ID and timestamps.

**Parameters:**
- `title` (required): Task title/summary
- `description` (required): Detailed task description with requirements and context
- `assignee` (optional): Agent name to assign (default: "LabRats")
- `priority` (optional): Priority level (default: "medium")
- `type` (optional): Task type (default: "task")
- `status` (optional): Initial status (default: "backlog")

**Example:**
```javascript
await callTool('create_task', {
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication with login/logout functionality. Requirements: secure token storage, password hashing, session management.',
  assignee: 'Patchy',
  priority: 'high',
  type: 'feature',
  status: 'todo'
});
```

### 4. `update_task`

Update task details like title, description, priority, or type. Does not change status or assignee.

**Parameters:**
- `taskId` (required): Task ID to update
- `title` (optional): New title
- `description` (optional): New description
- `priority` (optional): New priority
- `type` (optional): New type

**Example:**
```javascript
await callTool('update_task', {
  taskId: 'TASK-1234567890',
  priority: 'high',
  description: 'Updated requirements: Also add two-factor authentication support'
});
```

### 5. `move_and_assign_task`

Move task to different status and optionally reassign it. Efficient for workflow transitions.

**Parameters:**
- `taskId` (required): Task ID to move
- `status` (required): New status
- `assignee` (optional): New assignee
- `comment` (optional): Transition comment

**Example:**
```javascript
// Move task to in-progress and assign to Shiny
await callTool('move_and_assign_task', {
  taskId: 'TASK-1234567890',
  status: 'in-progress',
  assignee: 'Shiny',
  comment: 'Starting frontend implementation'
});

// Complete a task
await callTool('move_and_assign_task', {
  taskId: 'TASK-1234567890',
  status: 'done',
  comment: 'All tests passing, ready for deployment'
});
```

### 6. `add_task_comment`

Add a comment to a task for communication and progress tracking.

**Parameters:**
- `taskId` (required): Task ID to comment on
- `content` (required): Comment content
- `authorName` (required): Your agent name

**Example:**
```javascript
await callTool('add_task_comment', {
  taskId: 'TASK-1234567890',
  content: 'Completed the backend API endpoints. Frontend integration is next.',
  authorName: 'Patchy'
});
```

### 7. `get_task_comments`

Get all comments for a task to understand context and communication history.

**Parameters:**
- `taskId` (required): Task ID to get comments for

**Example:**
```javascript
await callTool('get_task_comments', { taskId: 'TASK-1234567890' });
```

### 8. `search_tasks`

Search tasks by title/description content. Useful for finding related work.

**Parameters:**
- `query` (required): Search query
- `status` (optional): Limit to specific status
- `assignee` (optional): Limit to specific assignee

**Example:**
```javascript
// Find authentication-related tasks
await callTool('search_tasks', { query: 'authentication' });

// Find open bug reports
await callTool('search_tasks', { 
  query: 'bug', 
  status: 'todo' 
});
```

### 9. `get_backlog`

Get backlog tasks ordered by priority (high → medium → low). Essential for sprint planning.

**Parameters:**
- `limit` (optional): Max tasks to return (default: 50, max: 200)

**Example:**
```javascript
// Get top 10 priority items
await callTool('get_backlog', { limit: 10 });

// Get full backlog
await callTool('get_backlog');
```

### 10. `get_my_tasks`

Get all tasks assigned to a specific agent. Use to see your current workload.

**Parameters:**
- `agentName` (required): Agent name to get tasks for
- `status` (optional): Filter by status

**Example:**
```javascript
// Get all my tasks
await callTool('get_my_tasks', { agentName: 'Cortex' });

// Get my current work
await callTool('get_my_tasks', { 
  agentName: 'Cortex', 
  status: 'in-progress' 
});
```

### 11. `link_tasks`

Create or remove relationships between tasks. Important for dependency management.

**Parameters:**
- `taskId` (required): Source task ID
- `linkedTaskId` (required): Target task ID to link/unlink
- `linkType` (required): Relationship type ('blocks', 'blocked-by', 'relates-to', 'duplicates', 'depends-on')
- `action` (optional): 'add' or 'remove' (default: 'add')

**Example:**
```javascript
// Create dependency relationship
await callTool('link_tasks', {
  taskId: 'TASK-auth-frontend',
  linkedTaskId: 'TASK-auth-backend', 
  linkType: 'depends-on'
});

// Remove relationship
await callTool('link_tasks', {
  taskId: 'TASK-1234567890',
  linkedTaskId: 'TASK-0987654321',
  linkType: 'relates-to',
  action: 'remove'
});
```

### 12. `get_task_stats`

Get task statistics grouped by status, priority, assignee, or type. Useful for project health monitoring.

**Parameters:**
- `groupBy` (optional): Grouping method ('status', 'priority', 'assignee', 'type') (default: 'status')

**Example:**
```javascript
// Project overview by status
await callTool('get_task_stats', { groupBy: 'status' });

// Workload distribution by assignee  
await callTool('get_task_stats', { groupBy: 'assignee' });
```

## Link Types Explained

- **blocks**: This task blocks the linked task from being completed
- **blocked-by**: This task is blocked by the linked task  
- **relates-to**: General relationship, tasks are related but not dependent
- **duplicates**: This task is a duplicate of the linked task
- **depends-on**: This task depends on the linked task being completed first

## Agent Assignment Guidelines

**Development Stages (todo, in-progress):**
- **Cortex**: Product strategy, planning, complex problem solving
- **Patchy**: Backend development, APIs, databases
- **Shiny**: Frontend development, UI/UX implementation  
- **Wheelie**: DevOps, deployment, infrastructure
- **Nestor**: Architecture, system design
- **Quill**: Documentation, technical writing
- **Sketchy**: UI/UX design, prototyping

**Review Stage:**
- **Clawsy**: Code review, quality assurance
- **Sniffy**: Testing, quality engineering
- **Trappy**: Security review, vulnerability assessment
- **Scratchy**: Critical analysis, constructive feedback
- **Cortex**: Product review, acceptance criteria validation

**Special Agents (not assignable to tasks):**
- **Switchy**: Single-agent mode coordinator
- **Dexy**: Vector search and indexing service

## Workflow Best Practices

1. **Use `get_backlog`** to see what work is available
2. **Use `get_my_tasks`** to check your current workload before taking on new work
3. **Add comments** when starting, updating, or completing tasks for transparency
4. **Link related tasks** to show dependencies and relationships
5. **Move tasks through stages** systematically: backlog → todo → in-progress → review → done
6. **Assign appropriate reviewers** when moving tasks to review stage
7. **Update priority** when circumstances change or blockers are discovered

## Common Workflows

### Taking on New Work
```javascript
// 1. Check backlog for high priority items
const backlog = await callTool('get_backlog', { limit: 10 });

// 2. Check your current workload
const myWork = await callTool('get_my_tasks', { 
  agentName: 'YourName', 
  status: 'in-progress' 
});

// 3. Move a task to todo and assign to yourself
await callTool('move_and_assign_task', {
  taskId: 'TASK-selected-from-backlog',
  status: 'todo',
  assignee: 'YourName',
  comment: 'Taking this on next'
});

// 4. Start working on it
await callTool('move_and_assign_task', {
  taskId: 'TASK-selected-from-backlog',
  status: 'in-progress',
  comment: 'Starting implementation'
});
```

### Completing Work
```javascript
// 1. Add completion comment
await callTool('add_task_comment', {
  taskId: 'TASK-completed-work',
  content: 'Implementation complete. All tests passing. Ready for review.',
  authorName: 'YourName'
});

// 2. Move to review and assign reviewer
await callTool('move_and_assign_task', {
  taskId: 'TASK-completed-work',
  status: 'review',
  assignee: 'Clawsy', // or appropriate reviewer
  comment: 'Ready for code review'
});
```

### Finding Related Work
```javascript
// Search for similar tasks
const related = await callTool('search_tasks', { 
  query: 'authentication security' 
});

// Link related tasks
await callTool('link_tasks', {
  taskId: 'TASK-current-work',
  linkedTaskId: 'TASK-related-work',
  linkType: 'relates-to'
});
```

This comprehensive toolkit enables full lifecycle task management within the LabRats.AI kanban system.