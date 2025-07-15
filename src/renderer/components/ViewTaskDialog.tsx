import React, { useState, useEffect } from 'react';
import { X, GitBranch, AlertCircle, Calendar, User, Tag, Trash2, Search, ExternalLink, FileCode, Code } from 'lucide-react';
import { Task } from '../../types/kanban';
import { workflowStages } from '../../config/workflow-stages';
import { agents } from '../../config/agents';
import { dexyService } from '../../services/dexy-service-renderer';

interface ViewTaskDialogProps {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onSelectTask?: (task: Task) => void;
}

interface SimilarTask {
  task: Task;
  similarity: number;
  reason: string;
}

export const ViewTaskDialog: React.FC<ViewTaskDialogProps> = ({ 
  task, 
  onClose,
  onEdit,
  onDelete,
  onSelectTask
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showSimilarTasks, setShowSimilarTasks] = useState(false);
  const currentStage = workflowStages.find(stage => stage.id === task.status);
  const assigneeAgent = agents.find(agent => agent.name === task.assignee);
  
  // Load similar tasks when component mounts
  useEffect(() => {
    loadSimilarTasks();
  }, [task.id]);

  const handleFileClick = (filePath: string, lineNumber?: number) => {
    // Dispatch event to navigate to file in FileExplorer
    const event = new CustomEvent('navigate-to-file', {
      detail: { filePath, lineNumber }
    });
    window.dispatchEvent(event);
    // Close this dialog
    onClose();
  };

  const loadSimilarTasks = async () => {
    try {
      setLoadingSimilar(true);
      
      // Check if Dexy is ready
      const isReady = await dexyService.isReady();
      if (!isReady) {
        console.log('[ViewTaskDialog] Dexy not ready, skipping similar tasks');
        return;
      }

      // TODO: Implement search functionality when available
      // For now, we'll skip similar tasks
      console.log('[ViewTaskDialog] Search functionality not available yet');
      setSimilarTasks([]);
    } catch (error) {
      console.error('[ViewTaskDialog] Error loading similar tasks:', error);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const generateSimilarityReason = (similarTask: Task, currentTask: Task, similarity: number): string => {
    const reasons: string[] = [];
    
    // Check various similarity factors
    if (similarTask.type === currentTask.type) {
      reasons.push('same type');
    }
    
    if (similarTask.priority === currentTask.priority) {
      reasons.push('same priority');
    }
    
    if (similarTask.assignee === currentTask.assignee) {
      reasons.push('same assignee');
    }
    
    if (similarity > 0.8) {
      reasons.push('high content similarity');
    } else if (similarity > 0.6) {
      reasons.push('medium content similarity');
    } else {
      reasons.push('related content');
    }
    
    return reasons.join(', ');
  };
  
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
            {onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            )}
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

          {/* File References */}
          {task.fileReferences && task.fileReferences.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">File References</h3>
              <div className="space-y-2">
                {task.fileReferences.map((ref, index) => (
                  <div 
                    key={index}
                    onClick={() => handleFileClick(ref.filePath, ref.lineNumber)}
                    className="bg-gray-900/50 rounded-lg p-3 hover:bg-gray-900/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-start space-x-3">
                      <FileCode className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300 font-mono truncate">
                          {ref.filePath}
                          {ref.lineNumber && <span className="text-gray-500">:{ref.lineNumber}</span>}
                        </div>
                        {ref.content && (
                          <div className="mt-1 text-xs text-gray-400 truncate">
                            {ref.content}
                          </div>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar Tasks */}
          {(similarTasks.length > 0 || loadingSimilar) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Similar Tasks</h3>
                <button
                  onClick={() => setShowSimilarTasks(!showSimilarTasks)}
                  className="flex items-center space-x-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span>{showSimilarTasks ? 'Hide' : 'Show'} ({similarTasks.length})</span>
                </button>
              </div>
              
              {showSimilarTasks && (
                <div className="space-y-3">
                  {loadingSimilar ? (
                    <div className="text-center py-4">
                      <div className="text-gray-400">Finding similar tasks...</div>
                    </div>
                  ) : similarTasks.length === 0 ? (
                    <div className="text-center py-4">
                      <div className="text-gray-400">No similar tasks found</div>
                    </div>
                  ) : (
                    similarTasks.map((similar, index) => (
                      <div key={similar.task.id} className="bg-gray-900/50 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="text-white font-medium">{similar.task.title}</h4>
                              <span className={`px-2 py-1 rounded text-xs ${getTypeColor(similar.task.type)}`}>
                                {similar.task.type}
                              </span>
                              <span className={`text-xs font-medium ${getPriorityColor(similar.task.priority)}`}>
                                {similar.task.priority}
                              </span>
                            </div>
                            <div className="text-sm text-gray-400 mb-2">
                              {similar.task.description && similar.task.description.length > 100
                                ? `${similar.task.description.substring(0, 100)}...`
                                : similar.task.description}
                            </div>
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              <span>Similarity: {Math.round(similar.similarity * 100)}%</span>
                              <span>Reason: {similar.reason}</span>
                              <span>Status: {similar.task.status}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => onSelectTask?.(similar.task)}
                            className="ml-4 p-2 hover:bg-gray-800 rounded transition-colors"
                            title="View this task"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Delete Task</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete "{task.title}"? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete?.();
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};