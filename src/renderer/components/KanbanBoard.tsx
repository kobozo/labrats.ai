import React, { useState, useEffect } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap, GitBranch, Workflow, Circle } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { getStageConfig } from '../../config/workflow-stages';
import { kanbanColumns, getColumnForStage, getStageNumber } from '../../config/kanban-columns';
import { kanbanService } from '../../services/kanban-service';
import { WorkflowVisualization } from './WorkflowVisualization';
import { CreateTaskDialog } from './CreateTaskDialog';



export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTaskStatus, setCreateTaskStatus] = useState<WorkflowStage>('backlog');
  const boardId = 'main-board'; // For now, using a single board

  // Load tasks on component mount
  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const loadedTasks = await kanbanService.getTasks(boardId);
      setTasks(loadedTasks || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const backlogTasks = tasks.filter(task => task.status === 'backlog');
  
  const getTasksByColumn = (columnId: string): Task[] => {
    const column = kanbanColumns.find(col => col.id === columnId);
    if (!column) return [];
    return tasks.filter(task => column.stages.includes(task.status));
  };

  const getStageColor = (stage: WorkflowStage): string => {
    const config = getStageConfig(stage);
    return config?.color || 'gray';
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
          <button
            onClick={() => setShowWorkflow(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
          >
            <Workflow className="w-4 h-4" />
            <span>View Workflow</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* Main workflow columns */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto mb-4">
        {kanbanColumns.map((column) => (
          <div 
            key={column.id} 
            className={`bg-gray-800 rounded-lg p-3 border min-w-[280px] transition-colors ${
              dragOverColumn === column.id ? 'border-blue-500 bg-gray-700' : 'border-gray-700'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(column.id);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedTask) {
                // Find the first stage in this column
                const targetStage = column.stages[0];
                if (draggedTask.status !== targetStage) {
                  const updatedTasks = tasks.map(task => 
                    task.id === draggedTask.id 
                      ? { ...task, status: targetStage }
                      : task
                  );
                  setTasks(updatedTasks);
                  // Save to backend
                  kanbanService.updateTask(boardId, {
                    ...draggedTask,
                    status: targetStage
                  });
                }
              }
              setDraggedTask(null);
              setDragOverColumn(null);
            }}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white text-sm">{column.title}</h3>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                  {getTasksByColumn(column.id).length}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-1">
                {column.description}
              </div>
              <div className="text-xs text-gray-400 italic">
                Exit: {column.exitGate}
              </div>
            </div>

            <div className="space-y-3">
              {getTasksByColumn(column.id).map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border-l-4 ${getPriorityColor(task.priority)} bg-gray-700 hover:bg-gray-600 transition-colors cursor-move`}
                  draggable
                  onDragStart={() => setDraggedTask(task)}
                  onDragEnd={() => {
                    setDraggedTask(null);
                    setDragOverColumn(null);
                  }}
                >
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium bg-${getStageColor(task.status)}-900 text-${getStageColor(task.status)}-300`}>
                        <Circle className="w-3 h-3" />
                        <span>{getStageNumber(task.status)}</span>
                        <span>{getStageConfig(task.status)?.title}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {task.hasBranch && <GitBranch className="w-3 h-3 text-green-400" />}
                        {getTypeIcon(task.type)}
                      </div>
                    </div>
                    <h4 className="text-white font-medium text-sm leading-tight">
                      <span className="text-xs text-gray-500 mr-1">{task.id}</span>
                      {task.title}
                    </h4>
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
                  setCreateTaskStatus(column.stages[0]);
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
            setTasks([...tasks, newTask]);
            await kanbanService.updateTask(boardId, newTask);
          }}
        />
      )}
    </div>
  );
};