import { WorkflowStageConfig, WorkflowStage } from '../types/kanban';

export const workflowStages: WorkflowStageConfig[] = [
  {
    id: 'backlog',
    title: 'Backlog',
    color: 'gray',
    primaryRats: ['All'],
    entryCriteria: ['Idea logged'],
    exitCriteria: ['Ready for work'],
    returnAuthority: {
      rats: ['All'],
      targetStages: ['backlog']
    }
  },
  {
    id: 'todo',
    title: 'To Do',
    color: 'blue',
    primaryRats: ['All'],
    entryCriteria: ['Approved for work'],
    exitCriteria: ['Ready to start'],
    returnAuthority: {
      rats: ['All'],
      targetStages: ['backlog']
    }
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: 'yellow',
    primaryRats: ['All'],
    entryCriteria: ['Work started'],
    exitCriteria: ['Implementation complete'],
    returnAuthority: {
      rats: ['All'],
      targetStages: ['todo']
    }
  },
  {
    id: 'review',
    title: 'Review',
    color: 'purple',
    primaryRats: ['All'],
    entryCriteria: ['Ready for review'],
    exitCriteria: ['Approved'],
    returnAuthority: {
      rats: ['All'],
      targetStages: ['in-progress']
    }
  },
  {
    id: 'done',
    title: 'Done',
    color: 'green',
    primaryRats: ['All'],
    entryCriteria: ['Approved'],
    exitCriteria: ['Complete']
  }
];

export const getStageConfig = (stageId: WorkflowStage): WorkflowStageConfig | undefined => {
  return workflowStages.find(stage => stage.id === stageId);
};

export const getStageIndex = (stageId: WorkflowStage): number => {
  return workflowStages.findIndex(stage => stage.id === stageId);
};

export const canTransitionTo = (fromStage: WorkflowStage, toStage: WorkflowStage, rat: string): boolean => {
  const fromIndex = getStageIndex(fromStage);
  const toIndex = getStageIndex(toStage);
  
  // Forward movement - only Cortex can move forward
  if (toIndex === fromIndex + 1) {
    return rat === 'Cortex';
  }
  
  // Backward movement - check return authority
  if (toIndex < fromIndex) {
    const fromConfig = getStageConfig(fromStage);
    if (!fromConfig?.returnAuthority) return false;
    
    const { rats, targetStages } = fromConfig.returnAuthority;
    return rats.includes(rat) && targetStages.includes(toStage);
  }
  
  return false;
};