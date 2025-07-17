/**
 * Create Task Dialog Component
 * Modal dialog for creating new tasks
 */

import React, { useState } from 'react';
import { SimpleTask, TaskStatus, TaskPriority } from '../../types/simple-kanban';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { Badge } from './ui/badge';
import { Plus, X } from 'lucide-react';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (task: Partial<SimpleTask>) => void;
  defaultStatus: TaskStatus;
  allTasks: SimpleTask[];
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  onCreate,
  defaultStatus,
  allTasks
}) => {
  const [task, setTask] = useState<Partial<SimpleTask>>({
    title: '',
    description: '',
    status: defaultStatus,
    priority: 'medium',
    tags: [],
    blockedBy: []
  });
  const [newTag, setNewTag] = useState('');

  const handleCreate = () => {
    if (task.title?.trim()) {
      onCreate(task);
      // Reset form
      setTask({
        title: '',
        description: '',
        status: defaultStatus,
        priority: 'medium',
        tags: [],
        blockedBy: []
      });
      setNewTag('');
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && task.tags && !task.tags.includes(newTag.trim())) {
      setTask({
        ...task,
        tags: [...task.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTask({
      ...task,
      tags: task.tags?.filter(t => t !== tag) || []
    });
  };

  const handleToggleBlocker = (blockerId: string) => {
    const blockedBy = task.blockedBy || [];
    if (blockedBy.includes(blockerId)) {
      setTask({
        ...task,
        blockedBy: blockedBy.filter(id => id !== blockerId)
      });
    } else {
      setTask({
        ...task,
        blockedBy: [...blockedBy, blockerId]
      });
    }
  };

  const availableBlockers = allTasks.filter(t => t.status !== 'done');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title*</Label>
            <Input
              id="title"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              placeholder="Enter task title"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={task.description}
              onChange={(e) => setTask({ ...task, description: e.target.value })}
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          {/* Status and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={task.status || 'todo'}
                onValueChange={(value) => setTask({ ...task, status: value as TaskStatus })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={task.priority || 'medium'}
                onValueChange={(value) => setTask({ ...task, priority: value as TaskPriority })}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <Label htmlFor="assignee">Assignee</Label>
            <Input
              id="assignee"
              value={task.assignee || ''}
              onChange={(e) => setTask({ ...task, assignee: e.target.value })}
              placeholder="Enter assignee name"
            />
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {task.tags?.map(tag => (
                <Badge key={tag} variant="secondary">
                  {tag}
                  <X
                    className="w-3 h-3 ml-1 cursor-pointer"
                    onClick={() => handleRemoveTag(tag)}
                  />
                </Badge>
              ))}
              <div className="flex gap-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag"
                  className="h-6 w-24 text-xs"
                />
                <Button size="sm" onClick={handleAddTag} className="h-6 w-6 p-0">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Blocked By */}
          {availableBlockers.length > 0 && (
            <div>
              <Label>Blocked By</Label>
              <div className="space-y-2 mt-2 max-h-32 overflow-y-auto border rounded p-2">
                {availableBlockers.map(blocker => (
                  <label key={blocker.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.blockedBy?.includes(blocker.id) || false}
                      onChange={() => handleToggleBlocker(blocker.id)}
                    />
                    <span className="text-sm">{blocker.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!task.title?.trim()}>
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};