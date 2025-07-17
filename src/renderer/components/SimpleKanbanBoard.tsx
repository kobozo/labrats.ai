/**
 * Simplified Kanban Board Component
 * Main board component that manages the kanban UI
 */

import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { SimpleTask, TaskStatus, KanbanBoard as KanbanBoardType } from '../../types/simple-kanban';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';
import { CreateTaskDialog } from './CreateTaskDialog';
import { Button } from './ui/button';
import { Plus, RefreshCw } from 'lucide-react';

interface SimpleKanbanBoardProps {
  projectPath: string;
}

export const SimpleKanbanBoard: React.FC<SimpleKanbanBoardProps> = ({ projectPath }) => {
  const [board, setBoard] = useState<KanbanBoardType | null>(null);
  const [activeTask, setActiveTask] = useState<SimpleTask | null>(null);
  const [selectedTask, setSelectedTask] = useState<SimpleTask | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogStatus, setCreateDialogStatus] = useState<TaskStatus>('todo');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load board data
  useEffect(() => {
    loadBoard();
    
    // Set up IPC listeners for real-time updates
    const handleTaskEvent = (_: any, event: any) => {
      console.log('[KANBAN] Task event received:', event);
      loadBoard(); // Reload board on any task event
    };
    
    window.api.on('simple-kanban-event', handleTaskEvent);
    
    // Periodic refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      loadBoard();
    }, 30000);
    
    return () => {
      window.api.off('simple-kanban-event', handleTaskEvent);
      clearInterval(refreshInterval);
    };
  }, [projectPath]);

  const loadBoard = async () => {
    try {
      const boardData = await window.api.kanban.getBoard();
      setBoard(boardData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[KANBAN] Error loading board:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTaskById(event.active.id as string);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    
    // Check if task can be moved (not blocked)
    const task = findTaskById(taskId);
    if (!task) return;
    
    if (task.blockedBy && task.blockedBy.length > 0) {
      // Check if all blockers are done
      const blockers = task.blockedBy.map(id => findTaskById(id)).filter(Boolean) as SimpleTask[];
      const hasActiveBlockers = blockers.some(blocker => blocker.status !== 'done');
      
      if (hasActiveBlockers) {
        alert('This task is blocked by other tasks that are not yet done.');
        return;
      }
    }
    
    // Move task
    try {
      await window.api.kanban.moveTask(taskId, newStatus);
      await loadBoard();
    } catch (error) {
      console.error('[KANBAN] Error moving task:', error);
    }
  };

  const findTaskById = (taskId: string): SimpleTask | undefined => {
    if (!board) return undefined;
    
    for (const column of board.columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  };

  const handleTaskClick = (task: SimpleTask) => {
    setSelectedTask(task);
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<SimpleTask>) => {
    try {
      await window.api.kanban.updateTask(taskId, updates);
      await loadBoard();
      setSelectedTask(null);
    } catch (error) {
      console.error('[KANBAN] Error updating task:', error);
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await window.api.kanban.deleteTask(taskId);
      await loadBoard();
      setSelectedTask(null);
    } catch (error) {
      console.error('[KANBAN] Error deleting task:', error);
    }
  };

  const handleCreateTask = async (task: Partial<SimpleTask>) => {
    try {
      await window.api.kanban.createTask(task);
      await loadBoard();
      setCreateDialogOpen(false);
    } catch (error) {
      console.error('[KANBAN] Error creating task:', error);
    }
  };

  const handleAddComment = async (taskId: string, content: string) => {
    try {
      // For now, use 'user' as the author
      await window.api.kanban.addComment(taskId, 'user', 'User', content);
      await loadBoard();
      
      // Update selected task if it's the one being commented on
      if (selectedTask?.id === taskId) {
        const updatedTask = findTaskById(taskId);
        if (updatedTask) setSelectedTask(updatedTask);
      }
    } catch (error) {
      console.error('[KANBAN] Error adding comment:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Loading kanban board...</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>No board data available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
        <div>
          <h2 className="text-xl font-semibold">{board.name}</h2>
          <p className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateDialogStatus('todo');
            setCreateDialogOpen(true);
          }}
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Task
        </Button>
      </div>
      
      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            <SortableContext
              items={board.columns.map(col => col.id)}
              strategy={horizontalListSortingStrategy}
            >
              {board.columns.map(column => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  onTaskClick={handleTaskClick}
                  onAddTask={(status) => {
                    setCreateDialogStatus(status);
                    setCreateDialogOpen(true);
                  }}
                />
              ))}
            </SortableContext>
          </div>
          
          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>
      
      {/* Dialogs */}
      {selectedTask && (
        <TaskDialog
          task={selectedTask}
          allTasks={board.columns.flatMap(col => col.tasks)}
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onAddComment={handleAddComment}
        />
      )}
      
      <CreateTaskDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateTask}
        defaultStatus={createDialogStatus}
        allTasks={board.columns.flatMap(col => col.tasks)}
      />
    </div>
  );
};