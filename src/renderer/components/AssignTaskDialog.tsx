import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { agents } from '../../config/agents';
import { workflowStages } from '../../config/workflow-stages';
import { WorkflowStage } from '../../types/kanban';

interface AssignTaskDialogProps {
  taskTitle: string;
  targetStage: WorkflowStage;
  onConfirm: (assignees: string[]) => void;
  onCancel: () => void;
}

export const AssignTaskDialog: React.FC<AssignTaskDialogProps> = ({ 
  taskTitle,
  targetStage, 
  onConfirm,
  onCancel
}) => {
  const stageConfig = workflowStages.find(stage => stage.id === targetStage);
  
  // Filter out Switchy and Dexy - all other agents can be assigned
  const assignableAgents = agents.filter(agent => 
    agent.name !== 'Switchy' && 
    agent.name !== 'Dexy'
  );
  
  // Build the list of available assignees
  const availableAssignees = targetStage === 'review' ? [
    { id: 'LabRats', name: 'LabRats (User)', avatar: null },
    ...assignableAgents.map(agent => ({ 
      id: agent.name, 
      name: agent.name, 
      avatar: agent.avatar 
    }))
  ] : [];

  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  
  // Log for debugging
  useEffect(() => {
    console.log('[AssignTaskDialog] Component mounted:', {
      targetStage,
      availableAssignees: availableAssignees.length,
      assigneeNames: availableAssignees.map(a => a.name)
    });
  }, [targetStage]);

  const handleConfirm = () => {
    if (targetStage === 'review') {
      if (selectedAssignee) {
        onConfirm([selectedAssignee]);
      }
    } else {
      // For non-review columns, use default assignee
      onConfirm(['LabRats']);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Assign Task</h2>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-300 mb-2">
            Moving "<span className="font-semibold">{taskTitle}</span>" to{' '}
            <span className="font-semibold text-purple-400">{stageConfig?.title || targetStage}</span>
          </p>
          <p className="text-sm text-gray-400">
            {targetStage === 'review' ? 'Select a reviewer to assign this task to:' : 'This task will be moved to the selected column.'}
          </p>
        </div>

        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {targetStage === 'review' && availableAssignees.length > 0 ? (
            availableAssignees.map(assignee => (
              <label
                key={assignee.id}
                className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedAssignee === assignee.id
                    ? 'bg-purple-900/50 border-purple-500'
                    : 'bg-gray-700/50 hover:bg-gray-700 border-gray-600'
                } border`}
              >
                <input
                  type="radio"
                  name="assignee"
                  value={assignee.id}
                  checked={selectedAssignee === assignee.id}
                  onChange={() => setSelectedAssignee(assignee.id)}
                  className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500"
                />
                <div className="flex items-center space-x-2 flex-1">
                  {assignee.avatar ? (
                    <img 
                      src={assignee.avatar} 
                      alt={assignee.name}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {assignee.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="text-white font-medium">{assignee.name}</span>
                </div>
              </label>
            ))
          ) : targetStage === 'review' ? (
            <p className="text-gray-400 text-center py-4">
              No reviewers available
            </p>
          ) : (
            <p className="text-gray-400 text-center py-4">
              Task will be moved directly to {stageConfig?.title || targetStage}
            </p>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleConfirm}
            disabled={targetStage === 'review' && !selectedAssignee}
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              (targetStage === 'review' && selectedAssignee) || targetStage !== 'review'
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {targetStage === 'review' ? 'Assign Reviewer' : 'Move Task'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};