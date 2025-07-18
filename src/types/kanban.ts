export type WorkflowStage = 
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'review'
  | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  type: 'feature' | 'bug' | 'task' | 'agent-task' | 'hotfix' | 'todo';
  status: WorkflowStage;
  createdBy: 'user' | 'agent';
  agentColor?: string;
  
  // Workflow fields
  primaryRats: string[];
  acceptanceCriteria?: string[];
  valueStatement?: string;
  riskTags?: string[];
  returnReason?: string;
  
  // New fields for linking and branch tracking
  epicId?: string;
  linkedTaskIds?: string[];
  branchName?: string;
  hasBranch?: boolean;
  boardId?: string;
  tags?: string[];
  
  // Blocking relationships
  blockedBy?: string[];  // Task IDs that block this task
  blocks?: string[];     // Task IDs that this task blocks
  
  // Comment system
  comments?: TaskComment[];
  
  // TODO-specific fields
  todoId?: string;
  todoType?: 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'BUG';
  
  // File references (array for multiple files)
  fileReferences?: Array<{
    filePath: string;
    lineNumber: number;
    content?: string;
  }>;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  projectPath: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorName: string;
  authorType: 'user' | 'agent';
  content: string;
  timestamp: string;
  agentColor?: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  color: string;
  taskIds: string[];
}

export interface Board {
  boardId: string;
  name: string;
  projectPath: string;
  tasks: Task[];
  epics: Epic[];
  columns: Column[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStageConfig {
  id: WorkflowStage;
  title: string;
  color: string;
  primaryRats: string[];
  allowedParallelWork?: string[];
  entryCriteria: string[];
  exitCriteria: string[];
  returnAuthority?: {
    rats: string[];
    targetStages: WorkflowStage[];
  };
}

export interface Column {
  id: WorkflowStage;
  title: string;
  color: string;
}