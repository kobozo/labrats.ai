import React, { useState, useEffect } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap, GitBranch, Workflow, Search, Code, FileCode } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { workflowStages, getStageConfig } from '../../config/workflow-stages';
import { kanbanService } from '../../services/kanban-service';
import { kanbanManager } from '../../services/kanban-manager-renderer';
import { WorkflowVisualization } from './WorkflowVisualization';
import { CreateTaskDialog } from './CreateTaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import { ViewTaskDialog } from './ViewTaskDialog';
import { EditTaskDialog } from './EditTaskDialog';
import { TaskSearchDialog } from './TaskSearchDialog';
import { dexyService } from '../../services/dexy-service-renderer';
import { todoService } from '../../services/todo-service-renderer';



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
  const [isSyncingTodos, setIsSyncingTodos] = useState(false);
  const [draggedOverTaskId, setDraggedOverTaskId] = useState<string | null>(null);
  const [draggedOverBacklog, setDraggedOverBacklog] = useState(false);
  const boardId = 'main-board'; // For now, using a single board
  
  // Set the current project in kanban service
  useEffect(() => {
    kanbanService.setCurrentProject(currentFolder);
    todoService.setCurrentProject(currentFolder);
  }, [currentFolder]);

  // Listen for open task view events from chat
  useEffect(() => {
    const handleOpenTaskView = (event: CustomEvent) => {
      const { taskId } = event.detail;
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setShowViewDialog(true);
      }
    };

    window.addEventListener('open-task-view', handleOpenTaskView as EventListener);
    return () => {
      window.removeEventListener('open-task-view', handleOpenTaskView as EventListener);
    };
  }, [tasks]);

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
      
      // Sync tasks with Dexy if ready
      // This will vectorize new tasks, update changed ones, and clean up orphaned vectors
      if (loadedTasks && dexyReady) {
        console.log('[KanbanBoard] Syncing tasks with Dexy');
        dexyService.syncTasks(loadedTasks, boardId).catch(error => {
          console.error('Error syncing tasks with Dexy:', error);
        });
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
        
        // Sync existing tasks after initialization
        if (tasks.length > 0) {
          console.log('[KanbanBoard] Running initial sync after Dexy initialization');
          await dexyService.syncTasks(tasks, boardId);
        }
      } else {
        console.warn('[KanbanBoard] Dexy service not ready - check configuration');
      }
    } catch (error) {
      console.error('[KanbanBoard] Failed to initialize Dexy:', error);
      setDexyReady(false);
    }
  };

  const syncTodosWithTasks = async () => {
    if (!currentFolder || isSyncingTodos) return;
    
    console.log('[KanbanBoard] Syncing TODOs with tasks...');
    setIsSyncingTodos(true);
    
    try {
      const syncResult = await todoService.sync();
      
      if (syncResult && syncResult.createdTasks > 0) {
        console.log('[KanbanBoard] Created', syncResult.createdTasks, 'new tasks from TODOs');
        
        // Reload tasks to include the new ones
        await loadTasks();
        
        // Show notification
        const notification = new Notification('TODO Sync Complete', {
          body: `Created ${syncResult.createdTasks} new tasks from TODO comments`,
          icon: '/icon.png'
        });
        
        // Auto-close notification after 5 seconds
        setTimeout(() => notification.close(), 5000);
      } else {
        console.log('[KanbanBoard] No new TODOs found to sync');
      }
    } catch (error) {
      console.error('[KanbanBoard] Error syncing TODOs:', error);
    } finally {
      setIsSyncingTodos(false);
    }
  };

  // Sort tasks by priority (high > medium > low) and then by updated date for same priority
  const sortTasksByPriority = (taskList: Task[]): Task[] => {
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    return [...taskList].sort((a, b) => {
      const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // For same priority, use updatedAt (most recently updated first)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  };
  
  const backlogTasks = sortTasksByPriority(tasks.filter(task => task.status === 'backlog'));
  
  const getTasksByStatus = (status: WorkflowStage): Task[] => {
    return sortTasksByPriority(tasks.filter(task => task.status === status));
  };

  // Helper function to strip markdown and get plain text for preview
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/```[^`]*```/g, '') // Code blocks
      .replace(/^#+\s+/gm, '') // Headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/^>\s+/gm, '') // Blockquotes
      .replace(/^[-*+]\s+/gm, '') // Lists
      .replace(/\n{2,}/g, ' ') // Multiple newlines
      .trim();
  };
  
  // Truncate text to specified length
  const truncateText = (text: string, maxLength: number): string => {
    const stripped = stripMarkdown(text);
    if (stripped.length <= maxLength) return stripped;
    return stripped.substring(0, maxLength) + '...';
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
      case 'todo': return <Code className="w-4 h-4 text-purple-400" />;
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
    <div className="bg-gray-900 p-6">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading board...</div>
        </div>
      ) : (
      <>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">LabRats Task Board</h1>
            <p className="text-gray-400">Simplified 5-stage workflow: backlog → todo → in-progress → review → done</p>
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
              onClick={syncTodosWithTasks}
              disabled={isSyncingTodos || !currentFolder}
              className={`flex items-center space-x-2 px-4 py-2 border border-gray-600 rounded-lg transition-colors ${
                isSyncingTodos || !currentFolder
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-800 hover:bg-blue-700 text-white'
              }`}
              title="Scan code for TODO comments and create tasks"
            >
              <Code className={`w-4 h-4 ${isSyncingTodos ? 'animate-spin' : ''}`} />
              <span>{isSyncingTodos ? 'Syncing...' : 'Sync TODOs'}</span>
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

      <div className="space-y-6">
        {/* Main workflow columns - 4 stages (excluding backlog) */}
        <div className="grid grid-cols-4 gap-4 overflow-x-auto" style={{ minHeight: '500px' }}>
        {workflowStages.slice(1).map((stage) => (
          <div 
            key={stage.id} 
            className={`bg-gray-800 rounded-lg p-3 border-2 transition-colors ${
              dragOverColumn === stage.id ? 'border-blue-500 bg-gray-700' : `border-${stage.color}-800 border-opacity-50`
            }`}
            style={{ minWidth: '250px' }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(stage.id);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedTask && draggedTask.status !== stage.id) {
                // Show assignment dialog for todo, in-progress, and review columns
                if (stage.id === 'todo' || stage.id === 'in-progress' || stage.id === 'review') {
                  setAssignDialogData({ task: draggedTask, targetStage: stage.id });
                  setShowAssignDialog(true);
                } else {
                  // For done column, move task directly
                  const updatedTask = {
                    ...draggedTask,
                    status: stage.id,
                    assignee: 'LabRats', // Default assignee for done column
                    updatedAt: new Date().toISOString()
                  };
                  
                  // Update local state
                  const updatedTasks = tasks.map(task => 
                    task.id === updatedTask.id ? updatedTask : task
                  );
                  setTasks(updatedTasks);
                  
                  // Save to backend (don't await to avoid blocking)
                  kanbanService.updateTask(boardId, updatedTask)
                    .then(() => {
                      if (dexyReady) {
                        return dexyService.updateTaskVector(updatedTask, boardId);
                      }
                    })
                    .then(() => {
                      // Dispatch event for Dashboard to update vector stats
                      const taskUpdatedEvent = new CustomEvent('task-updated', { 
                        detail: { task: updatedTask, boardId } 
                      });
                      window.dispatchEvent(taskUpdatedEvent);
                    })
                    .catch(console.error);
                }
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
              {getTasksByStatus(stage.id).map((task, index) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border-l-4 ${getPriorityColor(task.priority)} bg-gray-700 hover:bg-gray-600 transition-colors cursor-move ${
                    draggedOverTaskId === task.id ? 'border-t-2 border-t-blue-500' : ''
                  }`}
                  draggable
                  onDragStart={() => setDraggedTask(task)}
                  onDragEnd={() => {
                    setDraggedTask(null);
                    setDragOverColumn(null);
                    setDraggedOverTaskId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedTask && draggedTask.id !== task.id && draggedTask.status === stage.id) {
                      setDraggedOverTaskId(task.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation();
                    setDraggedOverTaskId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedTask && draggedTask.id !== task.id && draggedTask.status === stage.id) {
                      // Reorder tasks within the same column by swapping priorities
                      const newTasks = [...tasks];
                      const draggedTaskIndex = newTasks.findIndex(t => t.id === draggedTask.id);
                      const targetTaskIndex = newTasks.findIndex(t => t.id === task.id);
                      
                      if (draggedTaskIndex !== -1 && targetTaskIndex !== -1) {
                        // Swap priorities between the two tasks
                        const draggedPriority = newTasks[draggedTaskIndex].priority;
                        const targetPriority = newTasks[targetTaskIndex].priority;
                        
                        // Only swap if priorities are different
                        if (draggedPriority !== targetPriority) {
                          console.log(`[Column Reorder] Swapping priorities: ${draggedTask.id} (${draggedPriority}) <-> ${task.id} (${targetPriority})`);
                          newTasks[draggedTaskIndex].priority = targetPriority;
                          newTasks[targetTaskIndex].priority = draggedPriority;
                          newTasks[draggedTaskIndex].updatedAt = new Date().toISOString();
                          newTasks[targetTaskIndex].updatedAt = new Date().toISOString();
                          
                          setTasks(newTasks);
                          
                          // Save both tasks to backend
                          kanbanService.updateTask(boardId, newTasks[draggedTaskIndex]).catch(console.error);
                          kanbanService.updateTask(boardId, newTasks[targetTaskIndex]).catch(console.error);
                        } else {
                          // If same priority, create a micro-timestamp difference to establish order
                          console.log(`[Column Reorder] Same priority (${draggedPriority}), using timestamp: ${draggedTask.id} -> ${task.id}`);
                          const now = new Date();
                          const draggedTime = new Date(now.getTime() + 1); // 1ms later
                          
                          newTasks[draggedTaskIndex].updatedAt = draggedTime.toISOString();
                          newTasks[targetTaskIndex].updatedAt = now.toISOString();
                          
                          setTasks(newTasks);
                          
                          // Save both tasks to backend
                          kanbanService.updateTask(boardId, newTasks[draggedTaskIndex]).catch(console.error);
                          kanbanService.updateTask(boardId, newTasks[targetTaskIndex]).catch(console.error);
                        }
                      }
                    }
                    setDraggedOverTaskId(null);
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
                      {task.fileReferences && task.fileReferences.length > 0 && (
                        <div title={`${task.fileReferences.length} file reference${task.fileReferences.length > 1 ? 's' : ''}`}>
                          <FileCode className="w-4 h-4 text-purple-400" />
                        </div>
                      )}
                      {getTypeIcon(task.type)}
                    </div>
                  </div>
                  
                  <p className="text-gray-300 text-xs mb-3 leading-relaxed">
                    {stripMarkdown(task.description)}
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
        <div className="border-t border-gray-700 pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Backlog & Discovery</h3>
              <p className="text-sm text-gray-400">Drag items to move them into the workflow or reorder priority</p>
            </div>
            <button 
              onClick={() => {
                setCreateTaskStatus('backlog');
                setShowCreateDialog(true);
              }}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-gray-300 transition-colors flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add Task</span>
            </button>
          </div>
          
          {/* Scrollable table container */}
          <div className="overflow-auto bg-gray-800 rounded-lg border border-gray-700" style={{ height: '900px' }}>
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-900 border-b border-gray-700 z-10">
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-2 w-24">ID</th>
                  <th className="px-3 py-2 min-w-[200px]">Title</th>
                  <th className="px-3 py-2 min-w-[250px]">Description</th>
                  <th className="px-3 py-2 w-16 text-center">Type</th>
                  <th className="px-3 py-2 w-20 text-center">Priority</th>
                  <th className="px-3 py-2 w-24">Assignee</th>
                  <th className="px-3 py-2 w-16 text-center">Links</th>
                </tr>
              </thead>
              <tbody
                className={`${draggedOverBacklog ? 'bg-gray-700' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggedOverBacklog(true);
                }}
                onDragLeave={() => setDraggedOverBacklog(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedTask && draggedTask.status !== 'backlog') {
                    const updatedTask = {
                      ...draggedTask,
                      status: 'backlog' as WorkflowStage,
                      updatedAt: new Date().toISOString()
                    };
                    
                    // Update local state
                    const updatedTasks = tasks.map(task => 
                      task.id === updatedTask.id ? updatedTask : task
                    );
                    setTasks(updatedTasks);
                    
                    // Save to backend
                    kanbanService.updateTask(boardId, updatedTask)
                      .then(() => {
                        if (dexyReady) {
                          return dexyService.updateTaskVector(updatedTask, boardId);
                        }
                      })
                      .catch(console.error);
                  }
                  setDraggedTask(null);
                  setDraggedOverBacklog(false);
                }}
              >
                {backlogTasks.map((task, index) => (
                  <tr
                    key={task.id}
                    className={`border-b border-gray-700 hover:bg-gray-700 transition-colors cursor-pointer ${
                      draggedOverTaskId === task.id ? 'bg-gray-700' : ''
                    }`}
                    draggable
                    onDragStart={() => setDraggedTask(task)}
                    onDragEnd={() => {
                      setDraggedTask(null);
                      setDraggedOverTaskId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedTask && draggedTask.id !== task.id) {
                        setDraggedOverTaskId(task.id);
                      }
                    }}
                    onDragLeave={() => setDraggedOverTaskId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedTask && draggedTask.id !== task.id) {
                        // Reorder tasks in backlog
                        const newTasks = [...tasks];
                        const draggedIndex = newTasks.findIndex(t => t.id === draggedTask.id);
                        const targetIndex = newTasks.findIndex(t => t.id === task.id);
                        
                        if (draggedIndex !== -1 && targetIndex !== -1) {
                          // If dragged task is not in backlog, change its status first
                          if (newTasks[draggedIndex].status !== 'backlog') {
                            newTasks[draggedIndex].status = 'backlog';
                          }
                          
                          // Swap priorities between dragged and target tasks
                          const draggedPriority = newTasks[draggedIndex].priority;
                          const targetPriority = newTasks[targetIndex].priority;
                          
                          // Only swap if priorities are different
                          if (draggedPriority !== targetPriority) {
                            console.log(`[Backlog Reorder] Swapping priorities: ${draggedTask.id} (${draggedPriority}) <-> ${task.id} (${targetPriority})`);
                            newTasks[draggedIndex].priority = targetPriority;
                            newTasks[targetIndex].priority = draggedPriority;
                            newTasks[draggedIndex].updatedAt = new Date().toISOString();
                            newTasks[targetIndex].updatedAt = new Date().toISOString();
                            
                            setTasks(newTasks);
                            
                            // Save both tasks to backend
                            kanbanService.updateTask(boardId, newTasks[draggedIndex]).catch(console.error);
                            kanbanService.updateTask(boardId, newTasks[targetIndex]).catch(console.error);
                          } else {
                            // If same priority, create a micro-timestamp difference to establish order
                            console.log(`[Backlog Reorder] Same priority (${draggedPriority}), using timestamp: ${draggedTask.id} -> ${task.id}`);
                            const now = new Date();
                            const draggedTime = new Date(now.getTime() + 1); // 1ms later
                            
                            newTasks[draggedIndex].updatedAt = draggedTime.toISOString();
                            newTasks[targetIndex].updatedAt = now.toISOString();
                            
                            setTasks(newTasks);
                            
                            // Save both tasks to backend
                            kanbanService.updateTask(boardId, newTasks[draggedIndex]).catch(console.error);
                            kanbanService.updateTask(boardId, newTasks[targetIndex]).catch(console.error);
                          }
                        }
                      }
                      setDraggedOverTaskId(null);
                    }}
                    onClick={() => {
                      setSelectedTask(task);
                      setShowViewDialog(true);
                    }}
                  >
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">{task.id}</td>
                    <td className="px-3 py-2 text-sm text-white font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={task.title}>
                      {truncateText(task.title, 40)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis" title={stripMarkdown(task.description || '')}>
                      {truncateText(task.description || '', 60)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {getTypeIcon(task.type)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                        task.priority === 'high' ? 'bg-red-900 text-red-300' :
                        task.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                        'bg-green-900 text-green-300'
                      }`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">{task.assignee}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {task.hasBranch && <GitBranch className="w-3 h-3 text-green-400" />}
                        {task.linkedTasks && task.linkedTasks.length > 0 && (
                          <span className="text-xs text-purple-400">{task.linkedTasks.length}</span>
                        )}
                        {task.comments && task.comments.length > 0 && (
                          <span className="text-xs text-blue-400">{task.comments.length}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {backlogTasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <p>No tasks in backlog</p>
                        <p className="text-sm">Click "Add Task" to create one or drag tasks here from the workflow</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (taskData) => {
            // Generate unique ID
            const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create full task object
            const newTask: Task = {
              id: taskId,
              title: taskData.title || '',
              description: taskData.description || '',
              assignee: taskData.assignee || 'Unassigned',
              priority: taskData.priority || 'medium',
              type: 'task',
              status: taskData.status || createTaskStatus,
              createdBy: 'user',
              primaryRats: ['All'],
              tags: taskData.tags || [],
              blockedBy: taskData.blockedBy || [],
              blocks: [],
              comments: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              projectPath: currentFolder || ''
            };
            
            // Add to local state
            setTasks([...tasks, newTask]);
            
            // Save to backend
            await kanbanService.updateTask(boardId, newTask);
            
            // Vectorize with Dexy
            if (dexyReady) {
              await dexyService.updateTaskVector(newTask, boardId);
            }
            
            // Dispatch event for Dashboard to update vector stats
            const taskCreatedEvent = new CustomEvent('task-created', { 
              detail: { task: newTask, boardId } 
            });
            window.dispatchEvent(taskCreatedEvent);
            
            // Close dialog
            setShowCreateDialog(false);
          }}
          defaultStatus={createTaskStatus}
          allTasks={tasks}
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
              .then(() => {
                // Dispatch event for Dashboard to update vector stats
                const taskUpdatedEvent = new CustomEvent('task-updated', { 
                  detail: { task: updatedTask, boardId } 
                });
                window.dispatchEvent(taskUpdatedEvent);
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
          onSelectTask={(task) => {
            setSelectedTask(task);
            // Dialog remains open to show the new task
          }}
          onAddComment={async (taskId, comment) => {
            try {
              // Update local state
              const updatedTasks = tasks.map(task => {
                if (task.id === taskId) {
                  return {
                    ...task,
                    comments: [...(task.comments || []), comment],
                    updatedAt: new Date().toISOString()
                  };
                }
                return task;
              });
              setTasks(updatedTasks);
              
              // Update selectedTask for immediate UI update
              const updatedSelectedTask = updatedTasks.find(t => t.id === taskId);
              if (updatedSelectedTask) {
                setSelectedTask(updatedSelectedTask);
              }
              
              // Save to backend
              const taskToUpdate = updatedTasks.find(t => t.id === taskId);
              if (taskToUpdate) {
                await kanbanService.updateTask(boardId, taskToUpdate);
                
                // Update vector if Dexy is ready
                if (dexyReady) {
                  await dexyService.updateTaskVector(taskToUpdate, boardId);
                }
              }
            } catch (error) {
              console.error('Error adding comment:', error);
            }
          }}
          onDelete={async () => {
            try {
              // Delete from backend
              await kanbanManager.deleteTask(boardId, selectedTask.id);
              
              // Delete vector if Dexy is ready
              if (dexyReady) {
                await dexyService.deleteTaskVector(selectedTask.id);
              }
              
              // Update local state
              setTasks(tasks.filter(t => t.id !== selectedTask.id));
              
              // Dispatch event for Dashboard to update vector stats
              const taskDeletedEvent = new CustomEvent('task-deleted', { 
                detail: { taskId: selectedTask.id, boardId } 
              });
              window.dispatchEvent(taskDeletedEvent);
              
              // Close dialog
              setShowViewDialog(false);
              setSelectedTask(null);
            } catch (error) {
              console.error('Error deleting task:', error);
            }
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
            
            // Dispatch event for Dashboard to update vector stats
            const taskUpdatedEvent = new CustomEvent('task-updated', { 
              detail: { task: updatedTask, boardId } 
            });
            window.dispatchEvent(taskUpdatedEvent);
            
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