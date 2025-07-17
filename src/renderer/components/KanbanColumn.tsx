/**
 * Kanban Column Component
 * Represents a single column in the kanban board
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { KanbanColumn as KanbanColumnType, SimpleTask, TaskStatus } from '../../types/simple-kanban';
import { TaskCard } from './TaskCard';
import { Button } from './ui/button';
import { Plus } from 'lucide-react';
import { cn } from '../lib/utils';

interface KanbanColumnProps {
  column: KanbanColumnType;
  onTaskClick: (task: SimpleTask) => void;
  onAddTask: (status: TaskStatus) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onTaskClick,
  onAddTask
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id
  });

  const getColumnColor = (status: TaskStatus) => {
    switch (status) {
      case 'backlog':
        return 'border-gray-300 dark:border-gray-600';
      case 'todo':
        return 'border-blue-300 dark:border-blue-600';
      case 'in-progress':
        return 'border-yellow-300 dark:border-yellow-600';
      case 'review':
        return 'border-purple-300 dark:border-purple-600';
      case 'done':
        return 'border-green-300 dark:border-green-600';
      default:
        return 'border-gray-300 dark:border-gray-600';
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-80 bg-white dark:bg-gray-800 rounded-lg border-2 transition-colors',
        getColumnColor(column.id),
        isOver && 'bg-gray-50 dark:bg-gray-700 border-dashed'
      )}
    >
      {/* Column Header */}
      <div className="p-3 border-b dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{column.title}</h3>
            <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
              {column.tasks.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddTask(column.id)}
            className="h-7 w-7 p-0"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext
          items={column.tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">No tasks</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => onAddTask(column.id)}
                className="mt-2"
              >
                Add a task
              </Button>
            </div>
          ) : (
            column.tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
};