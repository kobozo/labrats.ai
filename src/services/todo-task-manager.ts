import * as fs from 'fs';
import * as path from 'path';
import { Task, WorkflowStage } from '../types/kanban';
import { TodoItem, TodoScanResult } from './todo-scanner-service';
import { kanbanService } from './kanban-service';

export interface TodoTaskMapping {
  todoId: string;
  taskId: string;
  filePath: string;
  lineNumber: number;
  createdAt: string;
  lastSynced: string;
  isValid: boolean; // Whether the TODO still exists in code
}

export interface TodoTaskConfig {
  version: string;
  projectPath: string;
  lastScan: string;
  mappings: TodoTaskMapping[];
  settings: {
    autoScan: boolean;
    createTasks: boolean;
    defaultPriority: 'low' | 'medium' | 'high';
    defaultAssignee: string;
    taskPrefix: string;
  };
}

export class TodoTaskManager {
  private static instance: TodoTaskManager;
  private currentProject: string | null = null;
  private configCache: Map<string, TodoTaskConfig> = new Map();

  private constructor() {}

  public static getInstance(): TodoTaskManager {
    if (!TodoTaskManager.instance) {
      TodoTaskManager.instance = new TodoTaskManager();
    }
    return TodoTaskManager.instance;
  }

  /**
   * Set the current project for TODO management
   */
  public setCurrentProject(projectPath: string | null): void {
    this.currentProject = projectPath;
  }

  /**
   * Get the TODO task config file path for a project
   */
  private getConfigPath(projectPath: string): string {
    return path.join(projectPath, '.labrats', 'boards', 'todo-mappings.json');
  }

  /**
   * Load TODO task configuration
   */
  private async loadConfig(projectPath: string): Promise<TodoTaskConfig> {
    const configPath = this.getConfigPath(projectPath);
    
    if (this.configCache.has(configPath)) {
      return this.configCache.get(configPath)!;
    }

    try {
      if (fs.existsSync(configPath)) {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as TodoTaskConfig;
        this.configCache.set(configPath, config);
        return config;
      }
    } catch (error) {
      console.error('[TODO-TASK-MANAGER] Error loading config:', error);
    }

    // Return default config
    const defaultConfig: TodoTaskConfig = {
      version: '1.0.0',
      projectPath,
      lastScan: new Date().toISOString(),
      mappings: [],
      settings: {
        autoScan: true,
        createTasks: true,
        defaultPriority: 'medium',
        defaultAssignee: 'Developer',
        taskPrefix: 'TODO'
      }
    };

    await this.saveConfig(projectPath, defaultConfig);
    return defaultConfig;
  }

  /**
   * Save TODO task configuration
   */
  private async saveConfig(projectPath: string, config: TodoTaskConfig): Promise<void> {
    const configPath = this.getConfigPath(projectPath);
    
    try {
      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Save config
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.configCache.set(configPath, config);
      
      console.log('[TODO-TASK-MANAGER] Config saved:', configPath);
    } catch (error) {
      console.error('[TODO-TASK-MANAGER] Error saving config:', error);
      throw error;
    }
  }

  /**
   * Create kanban tasks from TODO items
   */
  public async createTasksFromTodos(todos: TodoItem[], projectPath: string): Promise<Task[]> {
    console.log('[TODO-TASK-MANAGER] Creating tasks from', todos.length, 'TODOs');
    
    const config = await this.loadConfig(projectPath);
    const createdTasks: Task[] = [];
    const newMappings: TodoTaskMapping[] = [];

    for (const todo of todos) {
      try {
        // Check if task already exists
        const existingMapping = config.mappings.find(m => m.todoId === todo.id);
        if (existingMapping) {
          console.log('[TODO-TASK-MANAGER] Task already exists for TODO:', todo.id);
          continue;
        }

        // Create task
        const task = await this.createTaskFromTodo(todo, config, projectPath);
        createdTasks.push(task);

        // Create mapping
        const mapping: TodoTaskMapping = {
          todoId: todo.id,
          taskId: task.id,
          filePath: todo.filePath,
          lineNumber: todo.lineNumber,
          createdAt: new Date().toISOString(),
          lastSynced: new Date().toISOString(),
          isValid: true
        };

        newMappings.push(mapping);
        console.log('[TODO-TASK-MANAGER] Created task', task.id, 'for TODO:', todo.id);
      } catch (error) {
        console.error('[TODO-TASK-MANAGER] Error creating task for TODO:', todo.id, error);
      }
    }

    // Update config with new mappings
    config.mappings.push(...newMappings);
    config.lastScan = new Date().toISOString();
    await this.saveConfig(projectPath, config);

    return createdTasks;
  }

  /**
   * Create a single task from a TODO item
   */
  private async createTaskFromTodo(todo: TodoItem, config: TodoTaskConfig, projectPath: string): Promise<Task> {
    const taskId = `TASK-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Generate task title
    const title = `${config.settings.taskPrefix}: ${todo.content}`;
    
    // Generate task description
    const description = this.generateTaskDescription(todo);
    
    // Determine priority
    const priority = todo.priority || config.settings.defaultPriority;
    
    // Create task
    const task: Task = {
      id: taskId,
      title,
      description,
      assignee: config.settings.defaultAssignee,
      priority,
      type: this.mapTodoTypeToTaskType(todo.type) as Task['type'],
      status: 'backlog' as WorkflowStage,
      createdBy: 'user',
      primaryRats: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectPath
    };

    // Save task to kanban service
    await kanbanService.updateTask('main-board', task);
    
    return task;
  }

  /**
   * Generate task description from TODO
   */
  private generateTaskDescription(todo: TodoItem): string {
    let description = `**Code TODO**: ${todo.content}\n\n`;
    
    description += `**Location**: ${todo.filePath}:${todo.lineNumber}\n`;
    
    if (todo.author) {
      description += `**Author**: ${todo.author}\n`;
    }
    
    description += `**Type**: ${todo.type}\n`;
    description += `**Priority**: ${todo.priority || 'medium'}\n\n`;
    
    if (todo.context) {
      description += `**Context**:\n\`\`\`\n${todo.context}\n\`\`\`\n\n`;
    }
    
    description += `*This task was automatically created from a TODO comment in the code.*`;
    
    return description;
  }

  /**
   * Map TODO type to task type
   */
  private mapTodoTypeToTaskType(todoType: string): string {
    switch (todoType) {
      case 'FIXME': return 'bug';
      case 'BUG': return 'bug';
      case 'HACK': return 'technical-debt';
      case 'NOTE': return 'documentation';
      default: return 'task';
    }
  }

  /**
   * Get all TODO-task mappings for a project
   */
  public async getMappings(projectPath: string): Promise<TodoTaskMapping[]> {
    const config = await this.loadConfig(projectPath);
    return config.mappings;
  }

  /**
   * Get TODO-task mapping by TODO ID
   */
  public async getMappingByTodoId(todoId: string, projectPath: string): Promise<TodoTaskMapping | null> {
    const config = await this.loadConfig(projectPath);
    return config.mappings.find(m => m.todoId === todoId) || null;
  }

  /**
   * Get TODO-task mapping by task ID
   */
  public async getMappingByTaskId(taskId: string, projectPath: string): Promise<TodoTaskMapping | null> {
    const config = await this.loadConfig(projectPath);
    return config.mappings.find(m => m.taskId === taskId) || null;
  }

  /**
   * Update mapping validity
   */
  public async updateMappingValidity(todoId: string, isValid: boolean, projectPath: string): Promise<void> {
    const config = await this.loadConfig(projectPath);
    const mapping = config.mappings.find(m => m.todoId === todoId);
    
    if (mapping) {
      mapping.isValid = isValid;
      mapping.lastSynced = new Date().toISOString();
      await this.saveConfig(projectPath, config);
    }
  }

  /**
   * Remove mapping
   */
  public async removeMapping(todoId: string, projectPath: string): Promise<void> {
    const config = await this.loadConfig(projectPath);
    config.mappings = config.mappings.filter(m => m.todoId !== todoId);
    await this.saveConfig(projectPath, config);
  }

  /**
   * Get TODO task settings
   */
  public async getSettings(projectPath: string): Promise<TodoTaskConfig['settings']> {
    const config = await this.loadConfig(projectPath);
    return config.settings;
  }

  /**
   * Update TODO task settings
   */
  public async updateSettings(projectPath: string, settings: Partial<TodoTaskConfig['settings']>): Promise<void> {
    const config = await this.loadConfig(projectPath);
    config.settings = { ...config.settings, ...settings };
    await this.saveConfig(projectPath, config);
  }

  /**
   * Get statistics about TODO-task mappings
   */
  public async getStats(projectPath: string): Promise<{
    totalMappings: number;
    validMappings: number;
    invalidMappings: number;
    lastScan: string;
    tasksByType: Record<string, number>;
    tasksByPriority: Record<string, number>;
  }> {
    const config = await this.loadConfig(projectPath);
    const validMappings = config.mappings.filter(m => m.isValid);
    const invalidMappings = config.mappings.filter(m => !m.isValid);
    
    const tasksByType: Record<string, number> = {};
    const tasksByPriority: Record<string, number> = {};
    
    // We would need to get the actual tasks to compute these stats
    // For now, return basic stats
    
    return {
      totalMappings: config.mappings.length,
      validMappings: validMappings.length,
      invalidMappings: invalidMappings.length,
      lastScan: config.lastScan,
      tasksByType,
      tasksByPriority
    };
  }

  /**
   * Clean up invalid mappings
   */
  public async cleanupInvalidMappings(projectPath: string): Promise<number> {
    const config = await this.loadConfig(projectPath);
    const initialCount = config.mappings.length;
    
    config.mappings = config.mappings.filter(m => m.isValid);
    await this.saveConfig(projectPath, config);
    
    const removedCount = initialCount - config.mappings.length;
    console.log('[TODO-TASK-MANAGER] Cleaned up', removedCount, 'invalid mappings');
    
    return removedCount;
  }
}

export const todoTaskManager = TodoTaskManager.getInstance();