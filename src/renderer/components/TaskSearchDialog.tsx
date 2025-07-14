import React, { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, AlertCircle, Zap, Plus, ChevronRight } from 'lucide-react';
import { Task } from '../../types/kanban';
import { kanbanTaskIndexing, TaskSearchResult } from '../../services/kanban-task-indexing';

interface TaskSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (task: Task) => void;
  currentTask?: Task; // For duplicate detection
}

export const TaskSearchDialog: React.FC<TaskSearchDialogProps> = ({
  isOpen,
  onClose,
  onSelectTask,
  currentTask
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaskSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);
  
  useEffect(() => {
    // Check if we're in duplicate detection mode
    if (currentTask && isOpen) {
      setDuplicateMode(true);
      checkForDuplicates();
    } else {
      setDuplicateMode(false);
    }
  }, [currentTask, isOpen]);
  
  const checkForDuplicates = async () => {
    if (!currentTask) return;
    
    setIsSearching(true);
    try {
      const duplicates = await kanbanTaskIndexing.findDuplicates(currentTask);
      setResults(duplicates);
    } catch (error) {
      console.error('Error finding duplicates:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };
  
  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const searchResults = await kanbanTaskIndexing.searchTasks(searchQuery, {
        topK: 20,
        threshold: 0.5
      });
      setResults(searchResults);
    } catch (error) {
      console.error('Error searching tasks:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    // Debounce search
    const timeoutId = setTimeout(() => {
      performSearch(newQuery);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };
  
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'feature': return <Plus className="w-4 h-4 text-blue-400" />;
      case 'agent-task': return <Zap className="w-4 h-4 text-orange-400" />;
      default: return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const formatScore = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
          <div className="p-6 pb-4 border-b border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                {duplicateMode ? 'Potential Duplicate Tasks' : 'Search Tasks'}
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {!duplicateMode && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Search by title, description, or keywords..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            
            {duplicateMode && currentTask && (
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                <p className="text-yellow-300 text-sm">
                  Showing similar tasks to: <strong>{currentTask.title}</strong>
                </p>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            {isSearching ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                <p className="mt-2 text-gray-400">Searching...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {query || duplicateMode ? 'No matching tasks found' : 'Enter a search query to find tasks'}
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => (
                  <button
                    key={result.task.id}
                    onClick={() => {
                      onSelectTask(result.task);
                      onClose();
                    }}
                    className="w-full text-left p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className="mt-0.5">{getTypeIcon(result.task.type)}</div>
                        <div className="flex-1">
                          <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors">
                            {result.task.title}
                          </h3>
                          <p className="text-gray-300 text-sm mt-1 line-clamp-2">
                            {result.task.description}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="text-sm font-medium text-gray-400">
                          {formatScore(result.score)}
                        </div>
                        <div className={`text-xs ${getPriorityColor(result.task.priority)}`}>
                          {result.task.priority}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center space-x-4">
                        <span>#{result.task.id}</span>
                        <span>{result.task.status}</span>
                        <span>{result.task.assignee}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    
                    {result.highlights && result.highlights.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-600">
                        {result.highlights.map((highlight, idx) => (
                          <p key={idx} className="text-xs text-gray-300 italic">
                            "...{highlight}..."
                          </p>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};