import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { kanbanColumns } from '../../config/kanban-columns';
import { getStageIndex, canTransitionTo } from '../../config/workflow-stages';

interface StageProgressButtonProps {
  task: Task;
  onStageChange: (newStage: WorkflowStage) => void;
}

export const StageProgressButton: React.FC<StageProgressButtonProps> = ({ task, onStageChange }) => {
  const currentColumn = kanbanColumns.find(col => col.stages.includes(task.status));
  if (!currentColumn) return null;

  const currentStageIndex = currentColumn.stages.indexOf(task.status);
  const canProgressWithinColumn = currentStageIndex < currentColumn.stages.length - 1;
  const canMoveToNextColumn = currentStageIndex === currentColumn.stages.length - 1;

  const handleProgress = () => {
    if (canProgressWithinColumn) {
      // Move to next stage within the same column
      const nextStage = currentColumn.stages[currentStageIndex + 1];
      onStageChange(nextStage);
    } else if (canMoveToNextColumn) {
      // Move to first stage of next column
      const currentColumnIndex = kanbanColumns.indexOf(currentColumn);
      if (currentColumnIndex < kanbanColumns.length - 1) {
        const nextColumn = kanbanColumns[currentColumnIndex + 1];
        onStageChange(nextColumn.stages[0]);
      }
    }
  };

  const handleRegress = () => {
    if (currentStageIndex > 0) {
      // Move to previous stage within the same column
      const prevStage = currentColumn.stages[currentStageIndex - 1];
      onStageChange(prevStage);
    } else {
      // Move to last stage of previous column
      const currentColumnIndex = kanbanColumns.indexOf(currentColumn);
      if (currentColumnIndex > 0) {
        const prevColumn = kanbanColumns[currentColumnIndex - 1];
        const lastStage = prevColumn.stages[prevColumn.stages.length - 1];
        onStageChange(lastStage);
      }
    }
  };

  const isFirstStage = task.status === 'definition-of-ready';
  const isLastStage = task.status === 'retro-docs';

  return (
    <div className="flex items-center space-x-1 mt-2">
      {!isFirstStage && (
        <button
          onClick={handleRegress}
          className="p-1 hover:bg-gray-600 rounded transition-colors"
          title="Move to previous stage"
        >
          <ChevronLeft className="w-3 h-3" />
        </button>
      )}
      
      {!isLastStage && (
        <button
          onClick={handleProgress}
          className="p-1 hover:bg-gray-600 rounded transition-colors ml-auto"
          title="Move to next stage"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};