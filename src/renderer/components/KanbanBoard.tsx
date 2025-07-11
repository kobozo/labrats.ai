import React, { useState, useEffect } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap, GitBranch } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { workflowStages } from '../../config/workflow-stages';
import { kanbanService } from '../../services/kanban-service';


const mockTasks: Task[] = [
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

  const columns = workflowStages.map(stage => ({
    id: stage.id,
    title: stage.title,
    color: stage.color
  }));

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
        <h1 className="text-2xl font-bold text-white mb-2">LabRats Workflow Board</h1>
        <p className="text-gray-400">9-stage pipeline from idea to retrospective</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 h-full overflow-x-auto">
        {columns.map((column) => (
          <div key={column.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700 min-w-[280px]">
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
                  className={`p-3 rounded-lg border-l-4 ${getPriorityColor(task.priority)} bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer`}
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
    </div>
  );
};