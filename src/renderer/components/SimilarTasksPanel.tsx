import React, { useState, useEffect } from 'react';
import { Task } from '../../types/kanban';
import { dexyService, SimilarTask } from '../../services/dexy-service-renderer';
import { Search, AlertCircle, ChevronRight } from 'lucide-react';

interface SimilarTasksPanelProps {
  task: Partial<Task>;
  boardId: string;
  onSelectTask?: (task: Task) => void;
  excludeTaskId?: string;
}

export const SimilarTasksPanel: React.FC<SimilarTasksPanelProps> = ({
  task,
  boardId,
  onSelectTask,
  excludeTaskId
}) => {
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDexyReady, setIsDexyReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    checkDexyStatus();
  }, []);

  useEffect(() => {
    if (isDexyReady && task.title && task.title.length > 3) {
      // Debounce the search
      const timer = setTimeout(() => {
        searchSimilarTasks();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [task.title, task.description, isDexyReady]);

  const checkDexyStatus = async () => {
    try {
      const ready = await dexyService.isReady();
      setIsDexyReady(ready);
      if (!ready) {
        const config = await dexyService.getConfig();
        if (!config) {
          setError('Dexy is not configured. Please configure an embedding model for Dexy in Agent Settings.');
        }
      }
    } catch (err) {
      console.error('Failed to check Dexy status:', err);
      setIsDexyReady(false);
    }
  };

  const searchSimilarTasks = async () => {
    if (!task.title && !task.description) {
      setSimilarTasks([]);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const searchTask: Task = {
        id: excludeTaskId || 'temp',
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'backlog',
        priority: task.priority || 'medium',
        assignee: task.assignee || '',
        epicId: task.epicId,
        tags: task.tags || [],
        type: 'task',
        createdBy: 'user',
        primaryRats: [],
        projectPath: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const results = await dexyService.findSimilarTasks(searchTask, {
        topK: 5,
        threshold: 0.7,
        excludeTaskId
      });

      setSimilarTasks(results);
    } catch (err) {
      console.error('Failed to find similar tasks:', err);
      setError('Failed to search for similar tasks');
    } finally {
      setLoading(false);
    }
  };

  if (!isDexyReady && !error) {
    return null;
  }

  if (error) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 mb-4">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-yellow-400">Vector Search Unavailable</h4>
            <p className="text-xs text-gray-300 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasSimilarTasks = similarTasks.length > 0;

  return (
    <div className="mb-6">
      <div 
        className="flex items-center justify-between cursor-pointer py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-2">
          <Search className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-300">
            Similar Tasks {hasSimilarTasks && `(${similarTasks.length})`}
          </h3>
          {loading && (
            <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
        <ChevronRight 
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} 
        />
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {hasSimilarTasks ? (
            similarTasks.map((result) => (
              <div
                key={result.task.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => onSelectTask?.(result.task)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {result.task.title}
                    </h4>
                    {result.task.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {result.task.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-4 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        result.task.status === 'deliver-feedback' || result.task.status === 'retro-docs' ? 'bg-green-900 text-green-300' :
                        result.task.status === 'development' || result.task.status === 'code-review' ? 'bg-blue-900 text-blue-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {result.task.status.replace(/-/g, ' ')}
                      </span>
                      {result.task.priority && (
                        <span className={`text-xs ${
                          result.task.priority === 'high' ? 'text-red-400' :
                          result.task.priority === 'medium' ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {result.task.priority} priority
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <div className="text-xs text-gray-500">
                      {Math.round(result.similarity * 100)}% match
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No similar tasks found</p>
              <p className="text-xs mt-1">Tasks will appear here as you type</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};