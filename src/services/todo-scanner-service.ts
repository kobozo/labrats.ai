import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

export interface TodoItem {
  id: string;
  filePath: string;
  lineNumber: number;
  content: string;
  type: 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'BUG';
  author?: string;
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
  lastModified: string;
  context?: string; // Surrounding code context
}

export interface TodoScanResult {
  todos: TodoItem[];
  totalFiles: number;
  scannedFiles: number;
  errors: string[];
}

export class TodoScannerService {
  private static instance: TodoScannerService;
  private readonly TODO_PATTERNS = [
    /\/\/\s*(TODO|FIXME|HACK|NOTE|BUG)(?:\(([^)]+)\))?\s*:?\s*(.+)/gi,
    /\/\*\s*(TODO|FIXME|HACK|NOTE|BUG)(?:\(([^)]+)\))?\s*:?\s*(.+?)\s*\*\//gi,
    /#\s*(TODO|FIXME|HACK|NOTE|BUG)(?:\(([^)]+)\))?\s*:?\s*(.+)/gi,
    /<!--\s*(TODO|FIXME|HACK|NOTE|BUG)(?:\(([^)]+)\))?\s*:?\s*(.+?)\s*-->/gi
  ];

  private readonly SUPPORTED_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sh',
    '.css', '.scss', '.sass', '.less', '.html', '.xml', '.yml', '.yaml',
    '.json', '.md', '.sql', '.vue', '.svelte'
  ];

  private readonly EXCLUDE_PATTERNS = [
    'node_modules/**',
    'dist/**',
    'build/**',
    'out/**',
    '.git/**',
    '*.min.js',
    '*.min.css',
    'coverage/**',
    '*.log',
    '*.lock',
    'package-lock.json',
    'yarn.lock'
  ];

  private constructor() {}

  public static getInstance(): TodoScannerService {
    if (!TodoScannerService.instance) {
      TodoScannerService.instance = new TodoScannerService();
    }
    return TodoScannerService.instance;
  }

  /**
   * Scan a project directory for TODO comments
   */
  public async scanProject(projectPath: string): Promise<TodoScanResult> {
    console.log('[TODO-SCANNER] Starting scan of project:', projectPath);
    
    const result: TodoScanResult = {
      todos: [],
      totalFiles: 0,
      scannedFiles: 0,
      errors: []
    };

    try {
      // Find all eligible files
      const files = await this.findEligibleFiles(projectPath);
      result.totalFiles = files.length;

      console.log('[TODO-SCANNER] Found', files.length, 'files to scan');

      // Scan each file
      for (const filePath of files) {
        try {
          const todos = await this.scanFile(filePath, projectPath);
          result.todos.push(...todos);
          result.scannedFiles++;
        } catch (error) {
          console.error('[TODO-SCANNER] Error scanning file:', filePath, error);
          result.errors.push(`Error scanning ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log('[TODO-SCANNER] Scan complete. Found', result.todos.length, 'TODO items');
      return result;
    } catch (error) {
      console.error('[TODO-SCANNER] Error during project scan:', error);
      result.errors.push(`Project scan error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Find all files eligible for TODO scanning
   */
  private async findEligibleFiles(projectPath: string): Promise<string[]> {
    const patterns = this.SUPPORTED_EXTENSIONS.map(ext => `**/*${ext}`);
    const allFiles: string[] = [];

    for (const pattern of patterns) {
      try {
        const files = await glob.glob(pattern, {
          cwd: projectPath,
          absolute: true,
          ignore: this.EXCLUDE_PATTERNS
        });
        allFiles.push(...files);
      } catch (error) {
        console.error('[TODO-SCANNER] Error finding files with pattern:', pattern, error);
      }
    }

    // Remove duplicates and sort
    return [...new Set(allFiles)].sort();
  }

  /**
   * Scan a single file for TODO comments
   */
  private async scanFile(filePath: string, projectPath: string): Promise<TodoItem[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const todos: TodoItem[] = [];
    const relativePath = path.relative(projectPath, filePath);

    // Get file stats for lastModified
    const stats = await fs.promises.stat(filePath);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Try each pattern
      for (const pattern of this.TODO_PATTERNS) {
        pattern.lastIndex = 0; // Reset regex
        const match = pattern.exec(line);
        
        if (match) {
          const [, type, author, content] = match;
          
          // Generate unique ID based on file path and line number
          const id = this.generateTodoId(relativePath, lineNumber, content);
          
          // Extract context (surrounding lines)
          const context = this.extractContext(lines, lineIndex);
          
          // Determine priority from content
          const priority = this.determinePriority(content, type);

          todos.push({
            id,
            filePath: relativePath,
            lineNumber,
            content: content.trim(),
            type: type.toUpperCase() as TodoItem['type'],
            author: author?.trim(),
            priority,
            createdAt: new Date().toISOString(),
            lastModified: stats.mtime.toISOString(),
            context
          });
        }
      }
    }

    return todos;
  }

  /**
   * Generate a unique ID for a TODO item
   */
  private generateTodoId(filePath: string, lineNumber: number, content: string): string {
    const hash = this.simpleHash(filePath + lineNumber + content);
    return `TODO-${hash}`;
  }

  /**
   * Simple hash function for generating consistent IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Extract surrounding context for a TODO comment
   */
  private extractContext(lines: string[], todoLineIndex: number): string {
    const contextLines = 2; // Show 2 lines before and after
    const start = Math.max(0, todoLineIndex - contextLines);
    const end = Math.min(lines.length, todoLineIndex + contextLines + 1);
    
    return lines.slice(start, end)
      .map((line, index) => {
        const lineNum = start + index + 1;
        const marker = lineNum === todoLineIndex + 1 ? '>' : ' ';
        return `${marker} ${lineNum.toString().padStart(3, ' ')}: ${line}`;
      })
      .join('\n');
  }

  /**
   * Determine priority based on TODO content and type
   */
  private determinePriority(content: string, type: string): 'low' | 'medium' | 'high' {
    const lowerContent = content.toLowerCase();
    
    // High priority indicators
    if (type === 'FIXME' || type === 'BUG' || 
        lowerContent.includes('urgent') || lowerContent.includes('critical') ||
        lowerContent.includes('important') || lowerContent.includes('asap')) {
      return 'high';
    }
    
    // Medium priority indicators
    if (type === 'HACK' || 
        lowerContent.includes('should') || lowerContent.includes('need to') ||
        lowerContent.includes('must') || lowerContent.includes('required')) {
      return 'medium';
    }
    
    // Default to low priority
    return 'low';
  }

  /**
   * Scan for new TODOs since last scan
   */
  public async scanForNewTodos(projectPath: string, existingTodos: TodoItem[]): Promise<TodoItem[]> {
    const scanResult = await this.scanProject(projectPath);
    const existingIds = new Set(existingTodos.map(todo => todo.id));
    
    return scanResult.todos.filter(todo => !existingIds.has(todo.id));
  }

  /**
   * Check if a TODO still exists in the codebase
   */
  public async validateTodo(todo: TodoItem, projectPath: string): Promise<boolean> {
    try {
      const fullPath = path.join(projectPath, todo.filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      // Check if the TODO still exists at the expected line
      if (todo.lineNumber > lines.length) {
        return false;
      }
      
      const line = lines[todo.lineNumber - 1];
      return line.includes(todo.content);
    } catch (error) {
      console.error('[TODO-SCANNER] Error validating TODO:', error);
      return false;
    }
  }

  /**
   * Get TODO statistics for a project
   */
  public getTodoStats(todos: TodoItem[]): {
    total: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    byAuthor: Record<string, number>;
    byFileExtension: Record<string, number>;
  } {
    const stats = {
      total: todos.length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      byAuthor: {} as Record<string, number>,
      byFileExtension: {} as Record<string, number>
    };

    todos.forEach(todo => {
      // Count by type
      stats.byType[todo.type] = (stats.byType[todo.type] || 0) + 1;
      
      // Count by priority
      if (todo.priority) {
        stats.byPriority[todo.priority] = (stats.byPriority[todo.priority] || 0) + 1;
      }
      
      // Count by author
      const author = todo.author || 'Unknown';
      stats.byAuthor[author] = (stats.byAuthor[author] || 0) + 1;
      
      // Count by file extension
      const ext = path.extname(todo.filePath).toLowerCase();
      stats.byFileExtension[ext] = (stats.byFileExtension[ext] || 0) + 1;
    });

    return stats;
  }
}

export const todoScannerService = TodoScannerService.getInstance();