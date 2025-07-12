import React from 'react';
import { X, GitBranch, AlertCircle, Calendar, User, Tag } from 'lucide-react';
import { Task } from '../../types/kanban';
import { workflowStages } from '../../config/workflow-stages';
import { agents } from '../../config/agents';

interface ViewTaskDialogProps {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
}

export const ViewTaskDialog: React.FC<ViewTaskDialogProps> = ({ 
  task, 
  onClose,
  onEdit
}) => {
  const currentStage = workflowStages.find(stage => stage.id === task.status);
  const assigneeAgent = agents.find(agent => agent.name === task.assignee);
  
  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getTypeColor = (type: Task['type']) => {
    switch (type) {
      case 'bug': return 'bg-red-900/50 text-red-300';
      case 'feature': return 'bg-blue-900/50 text-blue-300';
      case 'agent-task': return 'bg-purple-900/50 text-purple-300';
      default: return 'bg-gray-900/50 text-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-white">{task.title}</h2>
            {task.hasBranch && (
              <div className="flex items-center text-green-400" title={task.branchName}>
                <GitBranch className="w-4 h-4 mr-1" />
                <span className="text-sm">Branch</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-400 mb-1">Status</div>
              <div className="text-white font-medium">
                {currentStage?.title || task.status}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-gray-400 mb-1">Type</div>
              <span className={`inline-flex px-2 py-1 rounded text-sm ${getTypeColor(task.type)}`}>
                {task.type}
              </span>
            </div>
            
            <div>
              <div className="text-sm text-gray-400 mb-1">Priority</div>
              <span className={`font-medium ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </span>
            </div>
            
            <div>
              <div className="text-sm text-gray-400 mb-1">Assignee</div>
              <div className="flex items-center space-x-2">
                {assigneeAgent ? (
                  <>
                    <img 
                      src={assigneeAgent.avatar} 
                      alt={assigneeAgent.name}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-white">{assigneeAgent.name}</span>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-white">{task.assignee}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ID and Timestamps */}
          <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
            <div>
              <div className="text-gray-400 mb-1">Task ID</div>
              <div className="text-gray-300 font-mono">{task.id}</div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Created</div>
              <div className="text-gray-300">
                {new Date(task.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Updated</div>
              <div className="text-gray-300">
                {new Date(task.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Description</h3>
            {task.description ? (
              <div 
                className="text-gray-300 prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: task.description }}
              />
            ) : (
              <p className="text-gray-500 italic">No description provided</p>
            )}
          </div>

          {/* Stage Details */}
          {currentStage && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Current Stage Details</h3>
              <div className="bg-gray-900/50 rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Primary Rats</div>
                  <div className="text-gray-300">{currentStage.primaryRats.join(', ')}</div>
                </div>
                {currentStage.allowedParallelWork && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Allowed Parallel Work</div>
                    <div className="text-gray-300">{currentStage.allowedParallelWork.join(', ')}</div>
                  </div>
                )}
                {currentStage.returnAuthority && (
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Return Authority</div>
                    <div className="text-gray-300">
                      {currentStage.returnAuthority.rats.join(', ')} → {currentStage.returnAuthority.targetStages.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Linked Tasks */}
          {task.linkedTaskIds && task.linkedTaskIds.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Linked Tasks</h3>
              <div className="space-y-2">
                {task.linkedTaskIds.map(taskId => (
                  <div key={taskId} className="text-gray-300 font-mono text-sm">
                    {taskId}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Epic */}
          {task.epicId && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Epic</h3>
              <div className="text-gray-300 font-mono text-sm">{task.epicId}</div>
            </div>
          )}

          {/* Branch Info */}
          {task.branchName && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Branch Information</h3>
              <div className="bg-gray-900/50 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <GitBranch className="w-4 h-4 text-green-400" />
                  <code className="text-green-400">{task.branchName}</code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};