import React, { useState, useEffect } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap, GitBranch, Workflow } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { workflowStages } from '../../config/workflow-stages';
import { kanbanService } from '../../services/kanban-service';
import { WorkflowVisualization } from './WorkflowVisualization';


const mockTasks: Task[] = [
  // Backlog items
  {
    id: 'IDEA-001',
    title: 'AI-powered code review suggestions',
    description: 'Implement AI to provide intelligent code review comments and suggestions',
    assignee: 'Unassigned',
    priority: 'medium',
    type: 'feature',
    status: 'backlog',
    createdBy: 'user',
    primaryRats: ['Cortex', 'Clawsy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  {
    id: 'IDEA-002',
    title: 'Performance monitoring dashboard',
    description: 'Create real-time dashboard for monitoring agent performance metrics',
    assignee: 'Unassigned',
    priority: 'low',
    type: 'feature',
    status: 'backlog',
    createdBy: 'agent',
    agentColor: 'green',
    primaryRats: ['Sniffy', 'Ziggy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  {
    id: 'BUG-002',
    title: 'Chat history export fails on large conversations',
    description: 'Export functionality times out when conversation exceeds 1000 messages',
    assignee: 'Unassigned',
    priority: 'high',
    type: 'bug',
    status: 'backlog',
    createdBy: 'user',
    primaryRats: ['Patchy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  // Active workflow items
  {
    id: 'TASK-001',
    title: 'Implement agent coordination system',
    description: 'Build the core system for multi-agent communication and task delegation',
    assignee: 'Patchy',
    priority: 'high',
    type: 'feature',
    status: 'development',
    createdBy: 'agent',
    agentColor: 'blue',
    primaryRats: ['Patchy', 'Shiny'],
    hasBranch: true,
    branchName: 'feature/TASK-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  {
    id: 'TASK-002',
    title: 'Add stress testing for chat system',
    description: 'Test concurrent users and edge cases for chat reliability',
    assignee: 'Ziggy',
    priority: 'medium',
    type: 'agent-task',
    status: 'qa-validation',
    createdBy: 'agent',
    agentColor: 'orange',
    primaryRats: ['Ziggy', 'Sniffy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  {
    id: 'TASK-003',
    title: 'Design responsive chat interface',
    description: 'Create beautiful, accessible UI components for multi-agent chat',
    assignee: 'Sketchy',
    priority: 'high',
    type: 'feature',
    status: 'ux-design',
    createdBy: 'agent',
    agentColor: 'purple',
    primaryRats: ['Sketchy'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  },
  {
    id: 'BUG-001',
    title: 'Fix memory leak in agent spawning',
    description: 'Optimize agent lifecycle management to prevent memory issues',
    assignee: 'Trappy',
    priority: 'high',
    type: 'bug',
    status: 'security-hardening',
    createdBy: 'agent',
    agentColor: 'red',
    primaryRats: ['Trappy'],
    hasBranch: true,
    branchName: 'bugfix/BUG-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectPath: ''
  }
];

export const KanbanBoard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [isLoading, setIsLoading] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const boardId = 'main-board'; // For now, using a single board

  // Load tasks on component mount
  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const loadedTasks = await kanbanService.getTasks(boardId);
      if (loadedTasks.length > 0) {
        setTasks(loadedTasks);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      // Keep mock data if loading fails
    } finally {
      setIsLoading(false);
    }
  };

  // Exclude backlog from main columns
  const columns = workflowStages.slice(1).map(stage => ({
    id: stage.id,
    title: stage.title,
    color: stage.color
  }));
  
  const backlogTasks = tasks.filter(task => task.status === 'backlog');

  const getTasksByStatus = (status: WorkflowStage) => {
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

  return (
    <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
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
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-x-auto mb-4">
        {columns.map((column) => (
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
              if (draggedTask && draggedTask.status !== column.id) {
                const updatedTasks = tasks.map(task => 
                  task.id === draggedTask.id 
                    ? { ...task, status: column.id as WorkflowStage }
                    : task
                );
                setTasks(updatedTasks);
                // Save to backend
                kanbanService.updateTask(boardId, {
                  ...draggedTask,
                  status: column.id as WorkflowStage
                });
              }
              setDraggedTask(null);
              setDragOverColumn(null);
            }}
          >
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-white text-sm">{column.title}</h3>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
              {workflowStages.find(s => s.id === column.id)?.primaryRats && (
                <div className="text-xs text-gray-500">
                  {workflowStages.find(s => s.id === column.id)?.primaryRats.join(', ')}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {getTasksByStatus(column.id).map((task) => (
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
              <button className="w-full p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center space-x-1">
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
            <button className="p-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center space-x-1 h-32">
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add to backlog</span>
            </button>
          </div>
        </div>
      </div>
      
      {showWorkflow && (
        <WorkflowVisualization onClose={() => setShowWorkflow(false)} />
      )}
    </div>
  );
};