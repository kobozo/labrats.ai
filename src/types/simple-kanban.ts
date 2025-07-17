/**
 * Simplified Kanban Types
 * Focused on core kanban functionality with minimal complexity
 */

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskComment {
  id: string;
  authorId: string;    // Agent ID
  authorName: string;  // Agent display name
  content: string;
  timestamp: Date;
}

export interface SimpleTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional fields
  assignee?: string;
  priority?: TaskPriority;
  tags?: string[];
  
  // Blocking relationships
  blockedBy?: string[];  // Task IDs that block this task
  blocks?: string[];     // Task IDs that this task blocks
  
  // Comments for agent handoffs
  comments?: TaskComment[];
  
  // Link to source (for TODO-generated tasks)
  sourceFile?: string;
  sourceLine?: number;
  sourceType?: 'todo' | 'fixme' | 'manual';
}

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: SimpleTask[];
}

export interface KanbanBoard {
  id: string;
  name: string;
  columns: KanbanColumn[];
  createdAt: Date;
  updatedAt: Date;
}

// Event types for real-time updates
export type TaskEvent = 
  | { type: 'task-created'; task: SimpleTask }
  | { type: 'task-updated'; task: SimpleTask }
  | { type: 'task-deleted'; taskId: string }
  | { type: 'task-moved'; taskId: string; from: TaskStatus; to: TaskStatus }
  | { type: 'comment-added'; taskId: string; comment: TaskComment };