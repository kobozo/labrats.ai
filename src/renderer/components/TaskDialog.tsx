/**
 * Task Dialog Component
 * Modal dialog for viewing and editing task details
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
import { 
  Trash2, 
  Save, 
  MessageSquare,
  Link,
  FileCode,
  Clock,
  User,
  Plus,
  X
} from 'lucide-react';

interface TaskDialogProps {
  task: SimpleTask;
  allTasks: SimpleTask[];
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<SimpleTask>) => void;
  onDelete: (taskId: string) => void;
  onAddComment: (taskId: string, content: string) => void;
}

export const TaskDialog: React.FC<TaskDialogProps> = ({
  task,
  allTasks,
  open,
  onClose,
  onUpdate,
  onDelete,
  onAddComment
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<Partial<SimpleTask>>({});
  const [newComment, setNewComment] = useState('');
  const [newTag, setNewTag] = useState('');

  const handleStartEdit = () => {
    setEditedTask({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      tags: task.tags || [],
      blockedBy: task.blockedBy || []
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdate(task.id, editedTask);
    setIsEditing(false);
    setEditedTask({});
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedTask({});
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      onAddComment(task.id, newComment.trim());
      setNewComment('');
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && editedTask.tags && !editedTask.tags.includes(newTag.trim())) {
      setEditedTask({
        ...editedTask,
        tags: [...editedTask.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditedTask({
      ...editedTask,
      tags: editedTask.tags?.filter(t => t !== tag) || []
    });
  };

  const handleToggleBlocker = (blockerId: string) => {
    const blockedBy = editedTask.blockedBy || [];
    if (blockedBy.includes(blockerId)) {
      setEditedTask({
        ...editedTask,
        blockedBy: blockedBy.filter(id => id !== blockerId)
      });
    } else {
      setEditedTask({
        ...editedTask,
        blockedBy: [...blockedBy, blockerId]
      });
    }
  };

  const availableBlockers = allTasks.filter(t => 
    t.id !== task.id && 
    t.status !== 'done'
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {isEditing ? (
              <Input
                value={editedTask.title || ''}
                onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                className="text-lg font-semibold"
              />
            ) : (
              <span>{task.title}</span>
            )}
            <div className="flex gap-2">
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  Edit
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(task.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              {isEditing ? (
                <Select
                  value={editedTask.status || 'todo'}
                  onValueChange={(value) => setEditedTask({ ...editedTask, status: value as TaskStatus })}
                >
                  <SelectTrigger>
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
              ) : (
                <p className="mt-1 capitalize">{task.status.replace('-', ' ')}</p>
              )}
            </div>
            
            <div>
              <Label>Priority</Label>
              {isEditing ? (
                <Select
                  value={editedTask.priority || 'medium'}
                  onValueChange={(value) => setEditedTask({ ...editedTask, priority: value as TaskPriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 capitalize">{task.priority || 'Medium'}</p>
              )}
            </div>
          </div>

          {/* Assignee */}
          <div>
            <Label>Assignee</Label>
            {isEditing ? (
              <Input
                value={editedTask.assignee || ''}
                onChange={(e) => setEditedTask({ ...editedTask, assignee: e.target.value })}
                placeholder="Enter assignee name"
              />
            ) : (
              <p className="mt-1">{task.assignee || 'Unassigned'}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            {isEditing ? (
              <Textarea
                value={editedTask.description || ''}
                onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                rows={4}
                placeholder="Enter task description"
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap">{task.description || 'No description'}</p>
            )}
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(isEditing ? editedTask.tags : task.tags)?.map(tag => (
                <Badge key={tag} variant="secondary">
                  {tag}
                  {isEditing && (
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  )}
                </Badge>
              ))}
              {isEditing && (
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
              )}
            </div>
          </div>

          {/* Blocked By */}
          {isEditing && (
            <div>
              <Label>Blocked By</Label>
              <div className="space-y-2 mt-2 max-h-32 overflow-y-auto">
                {availableBlockers.map(blocker => (
                  <label key={blocker.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editedTask.blockedBy?.includes(blocker.id) || false}
                      onChange={() => handleToggleBlocker(blocker.id)}
                    />
                    <span className="text-sm">{blocker.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Source Information */}
          {task.sourceFile && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <FileCode className="w-4 h-4" />
              <span>{task.sourceFile}:{task.sourceLine}</span>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Updated {new Date(task.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Comments Section */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments ({task.comments?.length || 0})
            </h3>
            
            <div className="space-y-3 mb-4">
              {task.comments?.map(comment => (
                <div key={comment.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{comment.authorName}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(comment.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1"
              />
              <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                Send
              </Button>
            </div>
          </div>
        </div>

        {isEditing && (
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};