export type WorkflowStage = 
  | 'backlog'
  | 'definition-of-ready'
  | 'ux-design'
  | 'development'
  | 'code-review'
  | 'qa-validation'
  | 'security-hardening'
  | 'product-acceptance'
  | 'deliver-feedback'
  | 'retro-docs';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  type: 'feature' | 'bug' | 'task' | 'agent-task' | 'hotfix';
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
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  projectPath: string;
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