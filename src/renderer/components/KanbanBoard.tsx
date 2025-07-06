import React, { useState } from 'react';
import { Plus, User, Clock, CheckCircle, AlertCircle, Zap } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  type: 'feature' | 'bug' | 'task' | 'agent-task';
  status: 'todo' | 'in-progress' | 'review' | 'done';
  createdBy: 'user' | 'agent';
  agentColor?: string;
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Implement agent coordination system',
    description: 'Build the core system for multi-agent communication and task delegation',
    assignee: 'Team Leader',
    priority: 'high',
    type: 'feature',
    status: 'in-progress',
    createdBy: 'agent',
    agentColor: 'blue'
  },
  {
    id: '2',
    title: 'Add stress testing for chat system',
    description: 'Test concurrent users and edge cases for chat reliability',
    assignee: 'Chaos Monkey',
    priority: 'medium',
    type: 'agent-task',
    status: 'todo',
    createdBy: 'agent',
    agentColor: 'orange'
  },
  {
    id: '3',
    title: 'Design responsive chat interface',
    description: 'Create beautiful, accessible UI components for multi-agent chat',
    assignee: 'Frontend Dev',
    priority: 'high',
    type: 'feature',
    status: 'review',
    createdBy: 'agent',
    agentColor: 'purple'
  },
  {
    id: '4',
    title: 'Fix memory leak in agent spawning',
    description: 'Optimize agent lifecycle management to prevent memory issues',
    assignee: 'Contrarian',
    priority: 'high',
    type: 'bug',
    status: 'done',
    createdBy: 'agent',
    agentColor: 'red'
  }
];

export const KanbanBoard: React.FC = () => {
  const [tasks] = useState<Task[]>(mockTasks);

  const columns = [
    { id: 'todo', title: 'To Do', color: 'gray' },
    { id: 'in-progress', title: 'In Progress', color: 'blue' },
    { id: 'review', title: 'Review', color: 'yellow' },
    { id: 'done', title: 'Done', color: 'green' }
  ];

  const getTasksByStatus = (status: string) => {
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
      default: return <CheckCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">AI Task Board</h1>
        <p className="text-gray-400">Track AI-generated tasks and development workflow</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full">
        {columns.map((column) => (
          <div key={column.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">{column.title}</h3>
              <span className="text-sm text-gray-400 bg-gray-700 px-2 py-1 rounded">
                {getTasksByStatus(column.id).length}
              </span>
            </div>

            <div className="space-y-3">
              {getTasksByStatus(column.id).map((task) => (
                <div
                  key={task.id}
                  className={`p-4 rounded-lg border-l-4 ${getPriorityColor(task.priority)} bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-white font-medium text-sm leading-tight">{task.title}</h4>
                    {getTypeIcon(task.type)}
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
                </div>
              ))}
              
              {/* Add new task placeholder */}
              <button className="w-full p-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center space-x-2">
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add task</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};