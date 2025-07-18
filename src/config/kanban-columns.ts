import { WorkflowStage } from '../types/kanban';

export interface KanbanColumn {
  id: string;
  title: string;
  stages: WorkflowStage[];
  color: string;
  description: string;
  exitGate: string;
}

export const kanbanColumns: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'TO-DO',
    stages: ['todo'],
    color: 'blue',
    description: 'Ready for work',
    exitGate: 'Work started'
  },
  {
    id: 'in-progress',
    title: 'IN PROGRESS',
    stages: ['in-progress'],
    color: 'yellow',
    description: 'Work in progress',
    exitGate: 'Ready for review'
  },
  {
    id: 'review',
    title: 'REVIEW',
    stages: ['review'],
    color: 'purple',
    description: 'Under review',
    exitGate: 'Approved'
  },
  {
    id: 'done',
    title: 'DONE',
    stages: ['done'],
    color: 'green',
    description: 'Complete',
    exitGate: 'Closed'
  }
];

export function getColumnForStage(stage: WorkflowStage): KanbanColumn | undefined {
  return kanbanColumns.find(col => col.stages.includes(stage));
}

export function getStageIndex(stage: WorkflowStage): number {
  const stageOrder: WorkflowStage[] = [
    'backlog',
    'todo',
    'in-progress',
    'review',
    'done'
  ];
  return stageOrder.indexOf(stage);
}

export function getStageNumber(stage: WorkflowStage): string {
  const stageNumbers: Record<WorkflowStage, string> = {
    'backlog': '0',
    'todo': '1',
    'in-progress': '2',
    'review': '3',
    'done': '4'
  };
  return stageNumbers[stage] || '?';
}