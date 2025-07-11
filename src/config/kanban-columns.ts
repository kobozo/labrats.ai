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
    stages: ['definition-of-ready'],
    color: 'gray',
    description: 'Ticket is groomed, AC clear, value confirmed',
    exitGate: '"Ready" label applied & Cortex pulls it next sprint'
  },
  {
    id: 'design-build',
    title: 'DESIGN & BUILD',
    stages: ['ux-design', 'development'],
    color: 'blue',
    description: 'UX Design → Development',
    exitGate: 'CI pipeline green & feature branch merged to develop'
  },
  {
    id: 'review-test',
    title: 'REVIEW & TEST',
    stages: ['code-review', 'qa-validation', 'security-hardening'],
    color: 'yellow',
    description: 'Code Review → QA & UX → Security',
    exitGate: 'All reviewers approve, QA/UX/Chaos pass, no high vulns'
  },
  {
    id: 'waiting-user',
    title: 'WAITING FOR USER',
    stages: ['product-acceptance', 'deliver-feedback'],
    color: 'orange',
    description: 'Product Acceptance → Deliver & Feedback',
    exitGate: 'PO & users sign off; any hot-fixes resolved'
  },
  {
    id: 'delivered',
    title: 'DELIVERED',
    stages: ['retro-docs'],
    color: 'green',
    description: 'Retro & Docs Close-out',
    exitGate: 'Retro complete → card archived / released'
  }
];

export function getColumnForStage(stage: WorkflowStage): KanbanColumn | undefined {
  return kanbanColumns.find(col => col.stages.includes(stage));
}

export function getStageIndex(stage: WorkflowStage): number {
  const stageOrder: WorkflowStage[] = [
    'backlog',
    'definition-of-ready',
    'ux-design',
    'development',
    'code-review',
    'qa-validation',
    'security-hardening',
    'product-acceptance',
    'deliver-feedback',
    'retro-docs'
  ];
  return stageOrder.indexOf(stage);
}

export function getStageNumber(stage: WorkflowStage): string {
  const stageNumbers: Record<WorkflowStage, string> = {
    'backlog': '0',
    'definition-of-ready': '1',
    'ux-design': '2',
    'development': '3',
    'code-review': '4',
    'qa-validation': '5',
    'security-hardening': '6',
    'product-acceptance': '7',
    'deliver-feedback': '8',
    'retro-docs': '9'
  };
  return stageNumbers[stage] || '?';
}