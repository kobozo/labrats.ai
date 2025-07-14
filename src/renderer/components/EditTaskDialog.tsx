import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { Task, WorkflowStage } from '../../types/kanban';
import { RichTextInput, RichTextInputRef } from './RichTextInput';
import { agents } from '../../config/agents';
import { workflowStages } from '../../config/workflow-stages';
import { SimilarTasksPanel } from './SimilarTasksPanel';

interface EditTaskDialogProps {
  task: Task;
  onClose: () => void;
  onSave: (updatedTask: Task) => void;
}

export const EditTaskDialog: React.FC<EditTaskDialogProps> = ({ 
  task, 
  onClose, 
  onSave 
}) => {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [type, setType] = useState<Task['type']>(task.type);
  const [priority, setPriority] = useState<Task['priority']>(task.priority);
  const [assignee, setAssignee] = useState(task.assignee);
  const [status, setStatus] = useState<WorkflowStage>(task.status);
  
  const richTextRef = useRef<RichTextInputRef>(null);
  
  // Get available assignees based on current status
  const currentStage = workflowStages.find(stage => stage.id === status);
  const availableAssignees = currentStage?.primaryRats.map(ratName => {
    if (ratName === 'LabRats') {
      return { id: 'LabRats', name: 'LabRats (User)' };
    }
    const agent = agents.find(a => a.name === ratName);
    return agent ? { id: agent.name, name: agent.name } : null;
  }).filter(Boolean) as Array<{ id: string; name: string }> || [];
  
  // Add current assignee if not in available list
  const currentAssigneeInList = availableAssignees.some(a => a.id === assignee);
  if (!currentAssigneeInList && assignee) {
    const currentAgent = agents.find(a => a.name === assignee);
    if (currentAgent) {
      availableAssignees.push({ id: currentAgent.name, name: currentAgent.name });
    } else if (assignee === 'LabRats') {
      availableAssignees.push({ id: 'LabRats', name: 'LabRats (User)' });
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updatedTask: Task = {
      ...task,
      title,
      description: richTextRef.current?.getMarkdown() || description,
      type,
      priority,
      assignee,
      status,
      updatedAt: new Date().toISOString(),
    };
    
    onSave(updatedTask);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Edit Task</h2>
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
                  onSubmit={() => {}} // Disable submit on enter for edit dialog
                  placeholder="Enter task description..."
                  className="min-h-[200px]"
                />
              </div>
            </div>
            
            {/* Two column layout for metadata */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WorkflowStage)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    {workflowStages.map(stage => (
                      <option key={stage.id} value={stage.id}>
                        {stage.title}
                      </option>
                    ))}
                  </select>
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
                  {status !== task.status && (
                    <p className="text-xs text-gray-400 mt-1">
                      Assignees limited to {currentStage?.title} stage participants
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Task metadata */}
            <div className="grid grid-cols-3 gap-4 text-sm pt-4 border-t border-gray-700">
              <div>
                <div className="text-gray-400">Task ID</div>
                <div className="text-gray-300 font-mono">{task.id}</div>
              </div>
              <div>
                <div className="text-gray-400">Created</div>
                <div className="text-gray-300">
                  {new Date(task.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Last Updated</div>
                <div className="text-gray-300">
                  {new Date(task.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex space-x-3">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Save Changes
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
                ...task,
                title,
                description: richTextRef.current?.getMarkdown() || description,
                status,
                priority,
                assignee,
                type
              }}
              boardId={task.boardId || 'main-board'}
              excludeTaskId={task.id}
              onSelectTask={(selectedTask) => {
                // Optional: View the selected task details
                console.log('Selected similar task:', selectedTask);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};