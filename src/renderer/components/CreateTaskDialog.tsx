/**
 * Create Task Dialog Component
 * Modal dialog for creating new tasks with rich features
 */

import React, { useState, useRef, useEffect } from 'react';
import { Task, WorkflowStage, TaskLink, TaskLinkType } from '../../types/kanban';
import { Plus, X, Search, Link, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [linkedTasks, setLinkedTasks] = useState<TaskLink[]>([]);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [linkType, setLinkType] = useState<TaskLinkType>('blocked-by');
  const [suggestedLinks, setSuggestedLinks] = useState<Task[]>([]);
  const [isSearchingLinks, setIsSearchingLinks] = useState(false);
  const [showLinkingSection, setShowLinkingSection] = useState(false);
  
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
      setLinkedTasks([]);
      setNewTag('');
      setSearchQuery('');
      setSuggestedLinks([]);
      setShowLinkingSection(false);
    }
  }, [open, defaultStatus]);
  
  // Search for similar tasks when title or description changes (for linking)
  useEffect(() => {
    const searchForLinks = async () => {
      if (!title && !description) {
        setSuggestedLinks([]);
        return;
      }
      
      setIsSearchingLinks(true);
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
        // Filter out already linked tasks
        const alreadyLinkedIds = new Set(linkedTasks.map(link => link.taskId));
        const suggestedTasks = similarTasks
          .map(st => st.task)
          .filter((t): t is Task => t !== undefined && t.status !== 'done' && !alreadyLinkedIds.has(t.id));
          
        setSuggestedLinks(suggestedTasks);
      } catch (error) {
        console.error('Error searching for links:', error);
      } finally {
        setIsSearchingLinks(false);
      }
    };
    
    const debounceTimer = setTimeout(searchForLinks, 500);
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
        linkedTasks,
        // Convert linkedTasks to legacy blockedBy for backward compatibility
        blockedBy: linkedTasks
          .filter(link => link.type === 'blocked-by')
          .map(link => link.taskId)
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

  const handleToggleLink = (taskId: string) => {
    const existingLink = linkedTasks.find(link => link.taskId === taskId);
    if (existingLink) {
      setLinkedTasks(linkedTasks.filter(link => link.taskId !== taskId));
    } else {
      setLinkedTasks([...linkedTasks, { taskId, type: linkType }]);
    }
  };
  
  const handleChangeLinkType = (taskId: string, newType: TaskLinkType) => {
    setLinkedTasks(linkedTasks.map(link => 
      link.taskId === taskId ? { ...link, type: newType } : link
    ));
  };
  
  // Filter tasks for manual search
  const searchResults = searchQuery.trim() 
    ? allTasks.filter(task => {
        const alreadyLinkedIds = new Set(linkedTasks.map(link => link.taskId));
        return task.status !== 'done' &&
               !alreadyLinkedIds.has(task.id) &&
               (task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                task.id.toLowerCase().includes(searchQuery.toLowerCase()));
      })
    : [];
    
  // Helper to get link type label
  const getLinkTypeLabel = (type: TaskLinkType): string => {
    switch (type) {
      case 'blocks': return 'Blocks';
      case 'blocked-by': return 'Blocked by';
      case 'relates-to': return 'Relates to';
      case 'duplicates': return 'Duplicates';
      case 'depends-on': return 'Depends on';
      default: return type;
    }
  };

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
              
              {/* Linked Tasks Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Linked Tasks {linkedTasks.length > 0 && `(${linkedTasks.length})`}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLinkingSection(!showLinkingSection)}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-sm text-gray-300 transition-colors"
                  >
                    <Link className="w-4 h-4" />
                    <span>Link Tasks</span>
                    {showLinkingSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Currently Linked Tasks - Always Visible */}
                {linkedTasks.length > 0 && (
                  <div className="mb-3 p-3 bg-gray-700 rounded-md border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">Currently linked tasks:</p>
                    <div className="space-y-2">
                      {linkedTasks.map(link => {
                        const task = allTasks.find(t => t.id === link.taskId);
                        return task ? (
                          <div key={link.taskId} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 flex-1">
                              <select
                                value={link.type}
                                onChange={(e) => handleChangeLinkType(link.taskId, e.target.value as TaskLinkType)}
                                className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white"
                              >
                                <option value="blocked-by">Blocked by</option>
                                <option value="blocks">Blocks</option>
                                <option value="relates-to">Relates to</option>
                                <option value="duplicates">Duplicates</option>
                                <option value="depends-on">Depends on</option>
                              </select>
                              <span className="text-gray-300 truncate">[{task.id}] {task.title}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleLink(link.taskId)}
                              className="text-red-400 hover:text-red-300 ml-2"
                              title="Remove link"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                
                {/* Collapsible Linking Section */}
                {showLinkingSection && (
                  <div className="space-y-3">
                    {/* Manual Search Box */}
                    <div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search for related tasks..."
                          className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    
                    {/* Link Type Selector */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Default link type for new links:</label>
                      <select
                        value={linkType}
                        onChange={(e) => setLinkType(e.target.value as TaskLinkType)}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="blocked-by">Blocked by</option>
                        <option value="blocks">Blocks</option>
                        <option value="relates-to">Relates to</option>
                        <option value="duplicates">Duplicates</option>
                        <option value="depends-on">Depends on</option>
                      </select>
                    </div>
                    
                    {/* Search Results */}
                    {searchQuery && searchResults.length > 0 && (
                      <div className="p-3 bg-gray-700 rounded-md border border-gray-600">
                        <p className="text-xs text-gray-400 mb-2">Search Results:</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {searchResults.map(task => (
                            <label key={task.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                              <input
                                type="checkbox"
                                checked={linkedTasks.some(link => link.taskId === task.id)}
                                onChange={() => handleToggleLink(task.id)}
                                className="rounded bg-gray-600 border-gray-500"
                              />
                              <span className="truncate">[{task.id}] {task.title}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* AI Suggested Links */}
                    {suggestedLinks.length > 0 && (
                      <div className="p-3 bg-gray-700 rounded-md border border-gray-600">
                        <p className="text-xs text-gray-400 mb-2">
                          {isSearchingLinks ? 'Searching...' : 'Suggested related tasks (based on similarity):'}
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {suggestedLinks.map(task => (
                            <label key={task.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 hover:text-white">
                              <input
                                type="checkbox"
                                checked={linkedTasks.some(link => link.taskId === task.id)}
                                onChange={() => handleToggleLink(task.id)}
                                className="rounded bg-gray-600 border-gray-500"
                              />
                              <span className="truncate">[{task.id}] {task.title}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* No results message */}
                    {showLinkingSection && searchQuery && searchResults.length === 0 && (
                      <div className="p-3 bg-gray-700 rounded-md border border-gray-600 text-center">
                        <p className="text-sm text-gray-400">No matching tasks found</p>
                      </div>
                    )}
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
                linkedTasks,
                blockedBy: linkedTasks
                  .filter(link => link.type === 'blocked-by')
                  .map(link => link.taskId)
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