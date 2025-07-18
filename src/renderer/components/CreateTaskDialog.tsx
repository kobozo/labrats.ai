/**
 * Create Task Dialog Component
 * Modal dialog for creating new tasks with rich features
 */

import React, { useState, useRef, useEffect } from 'react';
import { Task, WorkflowStage } from '../../types/kanban';
import { Plus, X, Search } from 'lucide-react';
import { RichTextInput, RichTextInputRef } from './RichTextInput';
import { agents } from '../../config/agents';
import { workflowStages } from '../../config/workflow-stages';
import { dexyService } from '../../services/dexy-service-renderer';
import { SimilarTasksPanel } from './SimilarTasksPanel';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (task: Partial<Task>) => void;
  defaultStatus: WorkflowStage;
  allTasks: Task[];
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  onCreate,
  defaultStatus,
  allTasks
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Task['type']>('task');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [assignee, setAssignee] = useState('LabRats');
  const [status, setStatus] = useState<WorkflowStage>(defaultStatus);
  const [tags, setTags] = useState<string[]>([]);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedBlockers, setSuggestedBlockers] = useState<Task[]>([]);
  const [isSearchingBlockers, setIsSearchingBlockers] = useState(false);
  
  const richTextRef = useRef<RichTextInputRef>(null);
  
  // Get available assignees - exclude Switchy and Dexy
  const availableAssignees = [
    { id: 'LabRats', name: 'LabRats (User)' },
    ...agents
      .filter(agent => agent.name !== 'Switchy' && agent.name !== 'Dexy')
      .map(agent => ({ 
        id: agent.name, 
        name: agent.name 
      }))
  ];
  
  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setType('task');
      setPriority('medium');
      setAssignee('LabRats');
      setStatus(defaultStatus);
      setTags([]);
      setBlockedBy([]);
      setNewTag('');
      setSearchQuery('');
      setSuggestedBlockers([]);
    }
  }, [open, defaultStatus]);
  
  // Search for similar tasks when title or description changes (for blockers)
  useEffect(() => {
    const searchForBlockers = async () => {
      if (!title && !description) {
        setSuggestedBlockers([]);
        return;
      }
      
      setIsSearchingBlockers(true);
      try {
        const similarTasks = await dexyService.findSimilarTasks(
          { 
            title, 
            description: richTextRef.current?.getMarkdown() || description,
            status: 'in-progress' // Dummy status for search
          } as Task,
          { 
            topK: 5,
            excludeTaskId: 'new-task' // Exclude nothing since this is a new task
          }
        );
        
        // Convert similar tasks to regular tasks for display
        const suggestedTasks = similarTasks
          .map(st => st.task)
          .filter((t): t is Task => t !== undefined && t.status !== 'done');
          
        setSuggestedBlockers(suggestedTasks);
      } catch (error) {
        console.error('Error searching for blockers:', error);
      } finally {
        setIsSearchingBlockers(false);
      }
    };
    
    const debounceTimer = setTimeout(searchForBlockers, 500);
    return () => clearTimeout(debounceTimer);
  }, [title, description, allTasks]);

  const handleCreate = () => {
    if (title.trim()) {
      onCreate({
        title,
        description: richTextRef.current?.getMarkdown() || description,
        status,
        priority,
        type,
        assignee,
        tags,
        blockedBy
      });
      onClose();
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleToggleBlocker = (blockerId: string) => {
    if (blockedBy.includes(blockerId)) {
      setBlockedBy(blockedBy.filter(id => id !== blockerId));
    } else {
      setBlockedBy([...blockedBy, blockerId]);
    }
  };
  
  // Filter tasks for manual search
  const searchResults = searchQuery.trim() 
    ? allTasks.filter(task => 
        task.status !== 'done' &&
        (task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
         task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         task.id.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  if (!open) return null;

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
          <div className="flex-1 overflow-y-auto p-6">
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
                  placeholder="Enter task title"
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
                    onSubmit={() => {}} // Disable submit on enter
                    placeholder="Enter task description..."
                    className="min-h-[150px]"
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
                      <option value="todo">TODO</option>
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
              
              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span key={tag} className="bg-gray-600 text-gray-200 px-2 py-1 rounded text-sm flex items-center">
                      {tag}
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-400"
                        onClick={() => handleRemoveTag(tag)}
                      />
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      placeholder="Add tag"
                      className="h-7 w-32 text-sm bg-gray-700 border border-gray-600 rounded px-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleAddTag}
                      className="h-7 w-7 bg-blue-600 hover:bg-blue-700 rounded flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Blocked By Section */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Blocked By Tasks
                </label>
                
                {/* Manual Search Box */}
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for blocking tasks..."
                      className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                
                {/* Search Results */}
                {searchQuery && searchResults.length > 0 && (
                  <div className="mb-3 p-3 bg-gray-700 rounded-md border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">Search Results:</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {searchResults.map(task => (
                        <label key={task.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                          <input
                            type="checkbox"
                            checked={blockedBy.includes(task.id)}
                            onChange={() => handleToggleBlocker(task.id)}
                            className="rounded bg-gray-600 border-gray-500"
                          />
                          <span className="truncate">[{task.id}] {task.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* AI Suggested Blockers */}
                {suggestedBlockers.length > 0 && (
                  <div className="mb-3 p-3 bg-gray-700 rounded-md border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">
                      {isSearchingBlockers ? 'Searching...' : 'Suggested blocking tasks (based on similarity):'}
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {suggestedBlockers.map(task => (
                        <label key={task.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                          <input
                            type="checkbox"
                            checked={blockedBy.includes(task.id)}
                            onChange={() => handleToggleBlocker(task.id)}
                            className="rounded bg-gray-600 border-gray-500"
                          />
                          <span className="truncate">[{task.id}] {task.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Selected Blockers */}
                {blockedBy.length > 0 && (
                  <div className="p-3 bg-gray-700 rounded-md border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">Selected blockers:</p>
                    <div className="space-y-1">
                      {blockedBy.map(id => {
                        const task = allTasks.find(t => t.id === id);
                        return task ? (
                          <div key={id} className="flex items-center justify-between text-sm text-gray-300">
                            <span className="truncate">[{task.id}] {task.title}</span>
                            <button
                              onClick={() => handleToggleBlocker(id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-8 flex space-x-3">
              <button
                onClick={handleCreate}
                disabled={!title.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
              >
                Create Task
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          
          {/* Similar Tasks Panel */}
          <div className="w-96 border-l border-gray-700 overflow-hidden">
            <SimilarTasksPanel
              task={{
                id: 'new-task',
                title,
                description: richTextRef.current?.getMarkdown() || description,
                status,
                priority,
                assignee,
                type,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: 'user',
                projectPath: '',
                boardId: 'main-board',
                primaryRats: [],
                tags,
                blockedBy
              }}
              boardId="main-board"
              excludeTaskId="new-task"
              onSelectTask={(selectedTask) => {
                // Optional: Pre-fill some fields from similar task
                console.log('Selected similar task:', selectedTask);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};