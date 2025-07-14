import React, { useState, useEffect } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap, GitBranch, Workflow, Search } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { workflowStages, getStageConfig } from '../../config/workflow-stages';
import { kanbanService } from '../../services/kanban-service';
import { WorkflowVisualization } from './WorkflowVisualization';
import { CreateTaskDialog } from './CreateTaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import { ViewTaskDialog } from './ViewTaskDialog';
import { EditTaskDialog } from './EditTaskDialog';
import { TaskSearchDialog } from './TaskSearchDialog';
import { dexyService } from '../../services/dexy-service-renderer';



interface KanbanBoardProps {
  currentFolder: string | null;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ currentFolder }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTaskStatus, setCreateTaskStatus] = useState<WorkflowStage>('backlog');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignDialogData, setAssignDialogData] = useState<{ task: Task; targetStage: WorkflowStage } | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dexyReady, setDexyReady] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState<Task | null>(null);
  const boardId = 'main-board'; // For now, using a single board
  
  // Set the current project in kanban service
  useEffect(() => {
    kanbanService.setCurrentProject(currentFolder);
  }, [currentFolder]);

  // Load tasks on component mount and when currentFolder changes
  useEffect(() => {
    if (currentFolder) {
      loadTasks();
      initializeDexy();
    } else {
      setTasks([]);
      setIsLoading(false);
      setDexyReady(false);
    }
  }, [currentFolder]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const loadedTasks = await kanbanService.getTasks(boardId);
      setTasks(loadedTasks || []);
      
      // Vectorize existing tasks with Dexy if ready
      // This happens only on initial load to ensure all tasks are indexed
      if (loadedTasks && loadedTasks.length > 0 && dexyReady) {
        console.log('[KanbanBoard] Vectorizing', loadedTasks.length, 'existing tasks with Dexy');
        // Vectorize in parallel but don't wait
        Promise.all(
          loadedTasks.map(task => 
            dexyService.vectorizeTask(task, boardId).catch(error => {
              console.error('Error vectorizing task with Dexy:', error);
            })
          )
        );
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeDexy = async () => {
    if (!currentFolder) return;
    
    try {
      await dexyService.initialize(currentFolder);
      const isReady = await dexyService.isReady();
      setDexyReady(isReady);
      
      if (isReady) {
        console.log('[KanbanBoard] Dexy service initialized and ready');
      } else {
        console.warn('[KanbanBoard] Dexy service not ready - check configuration');
      }
    } catch (error) {
      console.error('[KanbanBoard] Failed to initialize Dexy:', error);
      setDexyReady(false);
    }
  };

  const backlogTasks = tasks.filter(task => task.status === 'backlog');
  
  const getTasksByStatus = (status: WorkflowStage): Task[] => {
    return tasks.filter(task => task.status === status);
  };


  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-500 bg-red-900/20';
      case 'medium': return 'border-yellow-500 bg-yellow-900/20';
      case 'low': return 'border-green-500 bg-green-900/20';
      default: return 'border-gray-500 bg-gray-900/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'feature': return <Plus className="w-4 h-4 text-blue-400" />;
      case 'agent-task': return <Zap className="w-4 h-4 text-orange-400" />;
      case 'hotfix': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      default: return <CheckCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!currentFolder) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-gray-400">
          <p className="text-lg">No project folder is currently open</p>
          <p className="text-sm mt-2">Please open a project folder to use the kanban board</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading board...</div>
        </div>
      ) : (
      <>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">LabRats Workflow Board</h1>
            <p className="text-gray-400">9-stage pipeline from idea to retrospective</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSearchDialog(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>
            <button
              onClick={() => setShowWorkflow(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
            >
              <Workflow className="w-4 h-4" />
              <span>View Workflow</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* Main workflow columns - all 9 stages */}
        <div className="flex-1 flex gap-4 overflow-x-auto mb-4 pb-2 px-1">
        {workflowStages.slice(1).map((stage) => (
          <div 
            key={stage.id} 
            className={`bg-gray-800 rounded-lg p-3 border-2 min-w-[280px] flex-shrink-0 transition-colors ${
              dragOverColumn === stage.id ? 'border-blue-500 bg-gray-700' : `border-${stage.color}-800 border-opacity-50`
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(stage.id);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedTask && draggedTask.status !== stage.id) {
                // Show assignment dialog
                setAssignDialogData({ task: draggedTask, targetStage: stage.id });
                setShowAssignDialog(true);
              }
              setDraggedTask(null);
              setDragOverColumn(null);
            }}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className={`font-semibold text-${stage.color}-300 text-sm`}>{stage.title}</h3>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                  {getTasksByStatus(stage.id).length}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-1">
                {stage.primaryRats.join(', ')}
              </div>
            </div>

            <div className="space-y-3">
              {getTasksByStatus(stage.id).map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border-l-4 ${getPriorityColor(task.priority)} bg-gray-700 hover:bg-gray-600 transition-colors cursor-move`}
                  draggable
                  onDragStart={() => setDraggedTask(task)}
                  onDragEnd={() => {
                    setDraggedTask(null);
                    setDragOverColumn(null);
                  }}
                  onClick={() => {
                    setSelectedTask(task);
                    setShowViewDialog(true);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-medium text-sm leading-tight flex-1">
                      <span className="text-xs text-gray-500 mr-1">{task.id}</span>
                      {task.title}
                    </h4>
                    <div className="flex items-center space-x-1">
                      {task.hasBranch && <GitBranch className="w-4 h-4 text-green-400" />}
                      {getTypeIcon(task.type)}
                    </div>
                  </div>
                  
                  <p className="text-gray-300 text-xs mb-3 leading-relaxed">
                    {task.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {task.agentColor && (
                        <div className={`w-3 h-3 rounded-full bg-${task.agentColor}-500`}></div>
                      )}
                      <span className="text-xs text-gray-400">{task.assignee}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        task.priority === 'high' ? 'bg-red-900 text-red-300' :
                        task.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                        'bg-green-900 text-green-300'
                      }`}>
                        {task.priority}
                      </span>
                      
                      {task.createdBy === 'agent' && (
                        <span className="text-xs text-blue-400">🤖</span>
                      )}
                    </div>
                  </div>
                  
                  {task.returnReason && (
                    <div className="mt-2 text-xs text-red-400 italic">
                      ⟲ {task.returnReason}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Add new task placeholder */}
              <button 
                onClick={() => {
                  setCreateTaskStatus(stage.id);
                  setShowCreateDialog(true);
                }}
                className="w-full p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span className="text-xs">Add task</span>
              </button>
            </div>
          </div>
        ))}
        </div>
        
        {/* Backlog section */}
        <div className="border-t border-gray-700 pt-4">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-white">Backlog & Discovery</h3>
            <p className="text-sm text-gray-400">Drag items to move them into the workflow</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
            {backlogTasks.map((task) => (
              <div
                key={task.id}
                className={`p-3 rounded-lg border ${getPriorityColor(task.priority)} bg-gray-800 hover:bg-gray-700 transition-colors cursor-move`}
                draggable
                onDragStart={() => setDraggedTask(task)}
                onDragEnd={() => {
                  setDraggedTask(null);
                  setDragOverColumn(null);
                }}
                onClick={() => {
                  setSelectedTask(task);
                  setShowViewDialog(true);
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-white font-medium text-sm leading-tight flex-1">
                    <span className="text-xs text-gray-500 mr-1">{task.id}</span>
                    {task.title}
                  </h4>
                  <div className="flex items-center space-x-1">
                    {task.hasBranch && <GitBranch className="w-4 h-4 text-green-400" />}
                    {getTypeIcon(task.type)}
                  </div>
                </div>
                
                <p className="text-gray-300 text-xs mb-2 line-clamp-2">
                  {task.description}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{task.assignee}</span>
                  <div className="flex items-center space-x-1">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      task.priority === 'high' ? 'bg-red-900 text-red-300' :
                      task.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-green-900 text-green-300'
                    }`}>
                      {task.priority}
                    </span>
                    {task.createdBy === 'agent' && (
                      <span className="text-xs text-blue-400">🤖</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Add new backlog item */}
            <button 
              onClick={() => {
                setCreateTaskStatus('backlog');
                setShowCreateDialog(true);
              }}
              className="p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center space-x-1 h-32"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add to backlog</span>
            </button>
          </div>
        </div>
      </div>
      </>
      )}
      
      {showWorkflow && (
        <WorkflowVisualization onClose={() => setShowWorkflow(false)} />
      )}
      
      {showCreateDialog && (
        <CreateTaskDialog
          initialStatus={createTaskStatus}
          onClose={() => setShowCreateDialog(false)}
          onTaskCreated={async (newTask) => {
            try {
              // Check for duplicates before creating
              setCheckingDuplicates(newTask);
              setShowSearchDialog(true);
              
              setTasks([...tasks, newTask]);
              await kanbanService.updateTask(boardId, newTask);
              
              // Vectorize with Dexy
              if (dexyReady) {
                await dexyService.vectorizeTask(newTask, boardId);
              }
              
              // Reload tasks to ensure we have the latest data from storage
              await loadTasks();
            } catch (error) {
              console.error('Error saving task:', error);
            }
          }}
        />
      )}
      
      {showAssignDialog && assignDialogData && (
        <AssignTaskDialog
          taskTitle={assignDialogData.task.title}
          targetStage={assignDialogData.targetStage}
          onConfirm={(assignees) => {
            // Update task with new assignees and status
            const updatedTask = {
              ...assignDialogData.task,
              status: assignDialogData.targetStage,
              assignee: assignees.join(', '), // Join multiple assignees
              updatedAt: new Date().toISOString()
            };
            
            // Update local state
            const updatedTasks = tasks.map(task => 
              task.id === updatedTask.id ? updatedTask : task
            );
            setTasks(updatedTasks);
            
            // Save to backend and vectorize (don't await to avoid blocking dialog close)
            kanbanService.updateTask(boardId, updatedTask)
              .then(() => {
                if (dexyReady) {
                  return dexyService.updateTaskVector(updatedTask, boardId);
                }
              })
              .catch(console.error);
            
            // Close dialog immediately
            setShowAssignDialog(false);
            setAssignDialogData(null);
          }}
          onCancel={() => {
            setShowAssignDialog(false);
            setAssignDialogData(null);
          }}
        />
      )}
      
      {showViewDialog && selectedTask && (
        <ViewTaskDialog
          task={selectedTask}
          onClose={() => {
            setShowViewDialog(false);
            setSelectedTask(null);
          }}
          onEdit={() => {
            setShowViewDialog(false);
            setShowEditDialog(true);
          }}
        />
      )}
      
      {showEditDialog && selectedTask && (
        <EditTaskDialog
          task={selectedTask}
          onClose={() => {
            setShowEditDialog(false);
            setSelectedTask(null);
          }}
          onSave={async (updatedTask) => {
            // Update local state
            const updatedTasks = tasks.map(task => 
              task.id === updatedTask.id ? updatedTask : task
            );
            setTasks(updatedTasks);
            
            // Save to backend
            await kanbanService.updateTask(boardId, updatedTask);
            // Vectorize with Dexy
            if (dexyReady) {
              await dexyService.updateTaskVector(updatedTask, boardId);
            }
            
            // Close dialog
            setShowEditDialog(false);
            setSelectedTask(null);
          }}
        />
      )}
      
      {showSearchDialog && (
        <TaskSearchDialog
          isOpen={showSearchDialog}
          onClose={() => {
            setShowSearchDialog(false);
            setCheckingDuplicates(null);
          }}
          onSelectTask={(task) => {
            setSelectedTask(task);
            setShowViewDialog(true);
          }}
          currentTask={checkingDuplicates || undefined}
        />
      )}
    </div>
  );
};