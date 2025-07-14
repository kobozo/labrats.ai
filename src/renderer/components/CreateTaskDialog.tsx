import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { kanbanService } from '../../services/kanban-service';
import { agents } from '../../config/agents';
import { workflowStages } from '../../config/workflow-stages';
import { RichTextInput, RichTextInputRef } from './RichTextInput';
import { SimilarTasksPanel } from './SimilarTasksPanel';

interface CreateTaskDialogProps {
  initialStatus: WorkflowStage;
  onClose: () => void;
  onTaskCreated: (task: Task) => void;
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({ 
  initialStatus, 
  onClose, 
  onTaskCreated 
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Task['type']>('task');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [assignee, setAssignee] = useState('LabRats');
  const [status, setStatus] = useState<WorkflowStage>(
    initialStatus === 'backlog' || initialStatus === 'definition-of-ready' 
      ? initialStatus 
      : 'backlog'
  );
  
  const richTextRef = useRef<RichTextInputRef>(null);
  
  // Get available assignees based on selected status
  const currentStage = workflowStages.find(stage => stage.id === status);
  const availableAssignees = currentStage?.primaryRats.map(ratName => {
    if (ratName === 'LabRats') {
      return { id: 'LabRats', name: 'LabRats (User)' };
    }
    const agent = agents.find(a => a.name === ratName);
    return agent ? { id: agent.name, name: agent.name } : null;
  }).filter(Boolean) as Array<{ id: string; name: string }> || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newTask = kanbanService.createTask(title);
    const fullTask: Task = {
      ...newTask,
      description: richTextRef.current?.getMarkdown() || description,
      type,
      priority,
      assignee,
      status,
    };
    
    onTaskCreated(fullTask);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Create New Task</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
            </div>
            
            {/* Description with RichTextInput */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <div className="bg-gray-700 border border-gray-600 rounded-md">
                <RichTextInput
                  ref={richTextRef}
                  value={description}
                  onChange={setDescription}
                  onSubmit={() => {}} // Disable submit on enter for dialog
                  placeholder="Enter task description..."
                  className="min-h-[200px] max-h-[200px]"
                />
              </div>
            </div>
            
            {/* Two column layout for metadata */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Initial Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => {
                      const newStatus = e.target.value as WorkflowStage;
                      setStatus(newStatus);
                      // Reset assignee if not available in new status
                      const newStage = workflowStages.find(s => s.id === newStatus);
                      if (newStage && !newStage.primaryRats.includes(assignee)) {
                        setAssignee('LabRats');
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="backlog">Backlog & Discovery</option>
                    <option value="definition-of-ready">Definition of Ready</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    New tickets can only be created in these stages
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Task['type'])}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="task">Task</option>
                    <option value="feature">Feature</option>
                    <option value="bug">Bug</option>
                    <option value="agent-task">Agent Task</option>
                  </select>
                </div>
              </div>
              
              {/* Right column */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Task['priority'])}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Assignee
                  </label>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    {availableAssignees.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex space-x-3">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Create Task
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
          </form>
          
          {/* Similar Tasks Panel */}
          <div className="w-96 border-l border-gray-700 overflow-hidden">
            <SimilarTasksPanel
              task={{
                title,
                description: richTextRef.current?.getMarkdown() || description,
                status,
                priority,
                assignee,
                type
              }}
              boardId="main-board"
              onSelectTask={(task) => {
                // Optional: populate form with selected task data
                setTitle(task.title + ' (copy)');
                setDescription(task.description);
                setType(task.type);
                setPriority(task.priority);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};