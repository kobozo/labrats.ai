import { WorkflowStageConfig, WorkflowStage } from '../types/kanban';

export const workflowStages: WorkflowStageConfig[] = [
  {
    id: 'backlog',
    title: 'Backlog & Discovery',
    color: 'gray',
    primaryRats: ['Cortex', 'Scratchy', 'Sketchy', 'Quill'],
    entryCriteria: ['Idea logged'],
    exitCriteria: ['Acceptance-criteria draft', 'Value statement present'],
    returnAuthority: {
      rats: ['Scratchy'],
      targetStages: ['backlog']
    }
  },
  {
    id: 'definition-of-ready',
    title: 'Definition of Ready',
    color: 'purple',
    primaryRats: ['Cortex', 'Sketchy', 'Nestor', 'Trappy', 'Sniffy'],
    entryCriteria: ['Draft AC + value'],
    exitCriteria: ['DoR checklist met', 'UX mock-seed', 'Arch notes', 'Risk tags'],
    returnAuthority: {
      rats: ['Nestor', 'Trappy'],
      targetStages: ['backlog']
    }
  },
  {
    id: 'ux-design',
    title: 'UX Design',
    color: 'pink',
    primaryRats: ['Sketchy'],
    allowedParallelWork: ['Quill starts docs outline'],
    entryCriteria: ['DoR met'],
    exitCriteria: ['Signed-off mock-ups', 'UX acceptance tests defined'],
    returnAuthority: {
      rats: ['Cortex', 'Sketchy'],
      targetStages: ['definition-of-ready']
    }
  },
  {
    id: 'development',
    title: 'Development',
    color: 'blue',
    primaryRats: ['Patchy', 'Shiny', 'Quill', 'Wheelie'],
    allowedParallelWork: ['Backend & Frontend in parallel', 'Docs + DevOps alongside'],
    entryCriteria: ['Signed designs'],
    exitCriteria: ['Green CI', 'Build passes', 'Unit tests pass', 'Lint clean', 'SAST clean'],
    returnAuthority: {
      rats: ['Patchy', 'Shiny'],
      targetStages: ['development']
    }
  },
  {
    id: 'code-review',
    title: 'Code Review / Arch Gate',
    color: 'indigo',
    primaryRats: ['Clawsy', 'Nestor', 'Trappy'],
    allowedParallelWork: ['Reviews happen serially'],
    entryCriteria: ['Green CI'],
    exitCriteria: ['All reviewers approve PR'],
    returnAuthority: {
      rats: ['Clawsy', 'Nestor', 'Trappy'],
      targetStages: ['development']
    }
  },
  {
    id: 'qa-validation',
    title: 'QA & UX Validation',
    color: 'yellow',
    primaryRats: ['Sniffy', 'Sketchy', 'Ziggy'],
    allowedParallelWork: ['QA, UX, Chaos in parallel'],
    entryCriteria: ['Merged to develop', 'Deployed to QA'],
    exitCriteria: ['Zero blocking defects', 'UX & Chaos pass rate met'],
    returnAuthority: {
      rats: ['Sniffy', 'Sketchy', 'Ziggy'],
      targetStages: ['development']
    }
  },
  {
    id: 'security-hardening',
    title: 'Security Hardening',
    color: 'red',
    primaryRats: ['Trappy'],
    entryCriteria: ['QA pass'],
    exitCriteria: ['No high/critical vulns', 'Risk log updated'],
    returnAuthority: {
      rats: ['Trappy'],
      targetStages: ['development', 'definition-of-ready']
    }
  },
  {
    id: 'product-acceptance',
    title: 'Product Acceptance',
    color: 'orange',
    primaryRats: ['Cortex'],
    entryCriteria: ['Security green'],
    exitCriteria: ['PO demo passes', 'Release notes drafted'],
    returnAuthority: {
      rats: ['Cortex'],
      targetStages: ['qa-validation']
    }
  },
  {
    id: 'deliver-feedback',
    title: 'Deliver & Feedback',
    color: 'teal',
    primaryRats: ['Wheelie', 'Sketchy', 'Cortex'],
    allowedParallelWork: ['Ops deploy', 'Guided UX session', 'PO Q&A in parallel'],
    entryCriteria: ['Acceptance sign-off'],
    exitCriteria: ['Feedback captured', 'Hot-fix defects triaged'],
    returnAuthority: {
      rats: ['Wheelie', 'Sketchy', 'Cortex', 'Users'],
      targetStages: ['development', 'backlog']
    }
  },
  {
    id: 'retro-docs',
    title: 'Retro & Docs Close-out',
    color: 'green',
    primaryRats: ['All rats', 'Quill'],
    entryCriteria: ['Delivery complete'],
    exitCriteria: ['Action items logged', 'Docs closed']
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