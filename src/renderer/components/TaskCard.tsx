/**
 * Task Card Component
 * Individual task card that can be dragged between columns
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SimpleTask } from '../../types/simple-kanban';
import { 
  AlertCircle, 
  MessageSquare, 
  Link, 
  FileCode,
  Clock,
  User
} from 'lucide-react';
import { cn } from '../lib/utils';

interface TaskCardProps {
  task: SimpleTask;
  onClick?: () => void;
  isDragging?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onClick,
  isDragging = false 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20';
      case 'medium':
        return 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20';
      case 'low':
        return 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20';
      default:
        return 'border-gray-200 dark:border-gray-700';
    }
  };

  const isBlocked = task.blockedBy && task.blockedBy.length > 0;
  const hasComments = task.comments && task.comments.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'p-3 bg-white dark:bg-gray-800 rounded-lg border cursor-pointer',
        'hover:shadow-md transition-all duration-200',
        getPriorityColor(task.priority),
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        isBlocked && 'opacity-75'
      )}
    >
      {/* Title */}
      <h4 className="font-medium text-sm mb-2 line-clamp-2">{task.title}</h4>
      
      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map(tag => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {/* Meta information */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {/* Priority indicator */}
          {task.priority === 'high' && (
            <AlertCircle className="w-3 h-3 text-red-500" />
          )}
          
          {/* Blocked indicator */}
          {isBlocked && (
            <div className="flex items-center gap-1 text-orange-500">
              <Link className="w-3 h-3" />
              <span>{task.blockedBy!.length}</span>
            </div>
          )}
          
          {/* Comments indicator */}
          {hasComments && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{task.comments!.length}</span>
            </div>
          )}
          
          {/* Source file indicator */}
          {task.sourceFile && (
            <FileCode className="w-3 h-3" />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Assignee */}
          {task.assignee && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="truncate max-w-[80px]">{task.assignee}</span>
            </div>
          )}
          
          {/* Time since creation */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{getRelativeTime(task.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return 'now';
}