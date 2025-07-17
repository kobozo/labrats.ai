/**
 * Simple TODO Scanner
 * Automatically scans code for TODO/FIXME comments and creates kanban tasks
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { simpleKanbanService } from './simple-kanban-service';
import { SimpleTask } from '../types/simple-kanban';

interface TodoComment {
  type: 'todo' | 'fixme';
  text: string;
  file: string;
  line: number;
  author?: string;
}

export class SimpleTodoScanner extends EventEmitter {
  private static instance: SimpleTodoScanner;
  private projectPath: string | null = null;
  private isScanning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private todoTaskMap: Map<string, string> = new Map(); // Maps TODO key to task ID

  private readonly TODO_PATTERNS = [
    /\/\/\s*(TODO|FIXME)(?:\s*\(([^)]+)\))?\s*:?\s*(.+)/gi,
    /\/\*\s*(TODO|FIXME)(?:\s*\(([^)]+)\))?\s*:?\s*(.+?)\s*\*\//gi,
    /#\s*(TODO|FIXME)(?:\s*\(([^)]+)\))?\s*:?\s*(.+)/gi
  ];

  private readonly SCAN_PATTERNS = [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.java', '**/*.go', '**/*.rs',
    '**/*.cpp', '**/*.c', '**/*.cs', '**/*.rb',
    '**/*.php', '**/*.swift', '**/*.kt'
  ];

  private constructor() {
    super();
  }

  static getInstance(): SimpleTodoScanner {
    if (!SimpleTodoScanner.instance) {
      SimpleTodoScanner.instance = new SimpleTodoScanner();
    }
    return SimpleTodoScanner.instance;
  }

  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    
    // Load TODO-task mapping
    await this.loadTodoTaskMap();
    
    // Start periodic scanning (every 5 minutes)
    this.startPeriodicScan();
    
    // Do initial scan
    await this.scanProject();
  }

  private async loadTodoTaskMap(): Promise<void> {
    if (!this.projectPath) return;
    
    const mapPath = path.join(this.projectPath, '.labrats', 'kanban', 'todo-map.json');
    try {
      const data = await fs.readFile(mapPath, 'utf8');
      this.todoTaskMap = new Map(JSON.parse(data));
    } catch {
      this.todoTaskMap = new Map();
    }
  }

  private async saveTodoTaskMap(): Promise<void> {
    if (!this.projectPath) return;
    
    const mapPath = path.join(this.projectPath, '.labrats', 'kanban', 'todo-map.json');
    await fs.mkdir(path.dirname(mapPath), { recursive: true });
    await fs.writeFile(mapPath, JSON.stringify(Array.from(this.todoTaskMap.entries()), null, 2));
  }

  private startPeriodicScan(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    
    // Scan every 5 minutes
    this.scanInterval = setInterval(() => {
      this.scanProject().catch(console.error);
    }, 5 * 60 * 1000);
  }

  async scanProject(): Promise<void> {
    if (!this.projectPath || this.isScanning) return;
    
    this.isScanning = true;
    this.emit('scan-started');
    
    try {
      const files = await glob(this.SCAN_PATTERNS, {
        cwd: this.projectPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
        absolute: true
      });
      
      const todos: TodoComment[] = [];
      
      for (const file of files) {
        const fileTodos = await this.scanFile(file);
        todos.push(...fileTodos);
      }
      
      // Process found TODOs
      await this.processTodos(todos);
      
      this.emit('scan-completed', { todosFound: todos.length });
    } catch (error) {
      console.error('[TODO-SCANNER] Error scanning project:', error);
      this.emit('scan-error', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async scanFile(filePath: string): Promise<TodoComment[]> {
    const todos: TodoComment[] = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        for (const pattern of this.TODO_PATTERNS) {
          pattern.lastIndex = 0; // Reset regex
          let match;
          
          while ((match = pattern.exec(line)) !== null) {
            const [, type, author, text] = match;
            todos.push({
              type: type.toLowerCase() as 'todo' | 'fixme',
              text: text.trim(),
              file: filePath,
              line: index + 1,
              author: author?.trim()
            });
          }
        }
      });
    } catch (error) {
      console.error(`[TODO-SCANNER] Error scanning file ${filePath}:`, error);
    }
    
    return todos;
  }

  private async processTodos(todos: TodoComment[]): Promise<void> {
    const board = simpleKanbanService.getBoard();
    if (!board) return;
    
    // Get all existing tasks to check for duplicates
    const existingTasks: SimpleTask[] = [];
    for (const column of board.columns) {
      existingTasks.push(...column.tasks);
    }
    
    for (const todo of todos) {
      const todoKey = this.getTodoKey(todo);
      const existingTaskId = this.todoTaskMap.get(todoKey);
      
      if (existingTaskId) {
        // Check if task still exists
        const task = existingTasks.find(t => t.id === existingTaskId);
        if (task) {
          // Task exists, skip
          continue;
        }
      }
      
      // Create new task in backlog
      const newTask = await simpleKanbanService.createTask({
        title: `${todo.type.toUpperCase()}: ${todo.text}`,
        description: `Found in ${path.basename(todo.file)} at line ${todo.line}`,
        status: 'backlog',
        priority: todo.type === 'fixme' ? 'high' : 'medium',
        tags: ['auto-generated', todo.type],
        sourceFile: todo.file,
        sourceLine: todo.line,
        sourceType: todo.type
      });
      
      // Store mapping
      this.todoTaskMap.set(todoKey, newTask.id);
      
      // Add initial comment if author is known
      if (todo.author) {
        await simpleKanbanService.addComment(
          newTask.id,
          'todo-scanner',
          'TODO Scanner',
          `Originally created by ${todo.author}`
        );
      }
    }
    
    await this.saveTodoTaskMap();
  }

  private getTodoKey(todo: TodoComment): string {
    return `${todo.file}:${todo.line}:${todo.type}:${todo.text.substring(0, 50)}`;
  }

  async scanSingleFile(filePath: string): Promise<void> {
    if (!this.projectPath) return;
    
    const todos = await this.scanFile(filePath);
    await this.processTodos(todos);
  }

  async cleanup(): Promise<void> {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    await this.saveTodoTaskMap();
    this.removeAllListeners();
  }
}

export const simpleTodoScanner = SimpleTodoScanner.getInstance();