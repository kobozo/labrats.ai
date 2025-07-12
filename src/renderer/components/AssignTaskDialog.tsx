import React, { useState } from 'react';
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
  const availableRats = stageConfig?.primaryRats || [];
  
  // Map rat names to agent info, including LabRats (user)
  const availableAssignees = availableRats.map(ratName => {
    if (ratName === 'LabRats') {
      return { id: 'LabRats', name: 'LabRats (User)', avatar: null };
    }
    const agent = agents.find(a => a.name === ratName);
    return agent ? { id: agent.name, name: agent.name, avatar: agent.avatar } : null;
  }).filter(Boolean) as Array<{ id: string; name: string; avatar: string | null }>;

  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  const handleConfirm = () => {
    if (selectedAssignee) {
      onConfirm([selectedAssignee]);
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
            <span className="font-semibold text-blue-400">{stageConfig?.title || targetStage}</span>
          </p>
          <p className="text-sm text-gray-400">
            Select a team member to assign this task to:
          </p>
        </div>

        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {availableAssignees.length > 0 ? (
            availableAssignees.map(assignee => (
              <label
                key={assignee.id}
                className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedAssignee === assignee.id
                    ? 'bg-blue-900/50 border-blue-500'
                    : 'bg-gray-700/50 hover:bg-gray-700 border-gray-600'
                } border`}
              >
                <input
                  type="radio"
                  name="assignee"
                  checked={selectedAssignee === assignee.id}
                  onChange={() => setSelectedAssignee(assignee.id)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 focus:ring-blue-500"
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
                      <span className="text-sm font-bold text-white">L</span>
                    </div>
                  )}
                  <span className="text-white font-medium">{assignee.name}</span>
                </div>
              </label>
            ))
          ) : (
            <p className="text-gray-400 text-center py-4">
              No assignees available for this stage
            </p>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleConfirm}
            disabled={!selectedAssignee}
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              selectedAssignee
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            Assign & Move
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