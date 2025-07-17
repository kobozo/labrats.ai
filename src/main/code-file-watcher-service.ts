import * as path from 'path';
import { EventEmitter } from 'events';
import { CodeVectorizationService } from './code-vectorization-service';
import { debounce } from 'lodash';
import { unifiedFileWatcher, FileChangeEvent } from './unified-file-watcher-service';

export interface FileWatcherOptions {
  patterns?: string[];
  ignorePatterns?: string[];
  debounceDelay?: number;
}

export class CodeFileWatcherService extends EventEmitter {
  private static instance: CodeFileWatcherService;
  private projectPath: string | null = null;
  private codeVectorizationService: CodeVectorizationService;
  private changeQueue: Map<string, FileChangeEvent> = new Map();
  private processQueueDebounced: () => void;
  private isProcessing: boolean = false;
  private options: FileWatcherOptions;
  private subscriberId = 'code-vectorization';

  private readonly DEFAULT_PATTERNS = [
    // TypeScript/JavaScript
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    // Python
    '**/*.py',
    '**/*.pyw',
    // Java
    '**/*.java',
    // Go
    '**/*.go',
    // C/C++
    '**/*.cpp',
    '**/*.c',
    '**/*.cc',
    '**/*.cxx',
    '**/*.h',
    '**/*.hpp',
    // Rust
    '**/*.rs',
    // Swift
    '**/*.swift',
    // Kotlin
    '**/*.kt',
    '**/*.kts',
    // Ruby
    '**/*.rb',
    // PHP
    '**/*.php',
    // C#
    '**/*.cs',
  ];

  private readonly DEFAULT_IGNORE = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/tmp/**',
    '**/*.min.js',
    '**/*.map',
  ];

  private constructor() {
    super();
    this.codeVectorizationService = CodeVectorizationService.getInstance();
    this.options = {
      patterns: this.DEFAULT_PATTERNS,
      ignorePatterns: this.DEFAULT_IGNORE,
      debounceDelay: 2000, // 2 seconds
    };
    
    // Create debounced queue processor
    this.processQueueDebounced = debounce(
      () => this.processChangeQueue(),
      this.options.debounceDelay
    );
  }

  static getInstance(): CodeFileWatcherService {
    if (!CodeFileWatcherService.instance) {
      CodeFileWatcherService.instance = new CodeFileWatcherService();
    }
    return CodeFileWatcherService.instance;
  }

  /**
   * Start watching for file changes
   */
  async start(projectPath: string, options?: FileWatcherOptions): Promise<void> {
    await this.stop();

    this.projectPath = projectPath;
    this.options = { ...this.options, ...options };

    console.log('[CODE-FILE-WATCHER] Starting file watcher for:', projectPath);
    console.log('[CODE-FILE-WATCHER] Patterns:', this.options.patterns);

    // Subscribe to unified file watcher
    unifiedFileWatcher.subscribe(
      this.subscriberId,
      this.options.patterns!,
      (event) => this.handleFileChange(event.type, event.filePath)
    );

    // Start the unified watcher if not already started
    await unifiedFileWatcher.start(projectPath);

    console.log('[CODE-FILE-WATCHER] Subscribed to unified file watcher');
    this.emit('ready');
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    // Unsubscribe from unified watcher
    unifiedFileWatcher.unsubscribe(this.subscriberId);
    console.log('[CODE-FILE-WATCHER] Unsubscribed from unified file watcher');
    
    // Clear any pending changes
    this.changeQueue.clear();
  }

  /**
   * Handle file change events
   */
  private handleFileChange(type: FileChangeEvent['type'], filePath: string): void {
    const event: FileChangeEvent = {
      type,
      filePath,
      timestamp: new Date(),
    };

    console.log(`[CODE-FILE-WATCHER] File ${type}: ${filePath}`);

    // Add to queue (will overwrite if same file changed multiple times)
    this.changeQueue.set(filePath, event);

    // Emit immediate event for UI updates
    this.emit('fileChange', event);

    // Trigger debounced processing
    this.processQueueDebounced();
  }

  /**
   * Process the change queue
   */
  private async processChangeQueue(): Promise<void> {
    if (this.isProcessing || this.changeQueue.size === 0) {
      return;
    }

    this.isProcessing = true;
    const changes = Array.from(this.changeQueue.values());
    this.changeQueue.clear();

    console.log(`[CODE-FILE-WATCHER] Processing ${changes.length} file changes`);
    this.emit('processingStart', { count: changes.length });

    const results = {
      successful: 0,
      failed: 0,
      deleted: 0,
    };

    for (const change of changes) {
      try {
        switch (change.type) {
          case 'add':
          case 'change':
            await this.vectorizeFile(change.filePath);
            results.successful++;
            break;
          case 'unlink':
            await this.deleteFileVectors(change.filePath);
            results.deleted++;
            break;
        }
        
        this.emit('fileProcessed', {
          filePath: change.filePath,
          type: change.type,
          success: true,
        });
      } catch (error) {
        console.error(`[CODE-FILE-WATCHER] Failed to process ${change.filePath}:`, error);
        results.failed++;
        
        this.emit('fileProcessed', {
          filePath: change.filePath,
          type: change.type,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    this.isProcessing = false;
    this.emit('processingComplete', results);
    console.log('[CODE-FILE-WATCHER] Processing complete:', results);
  }

  /**
   * Vectorize a single file
   */
  private async vectorizeFile(filePath: string): Promise<void> {
    if (!this.codeVectorizationService.isReady()) {
      throw new Error('Code vectorization service not ready');
    }

    // Delete existing vectors for the file first
    await this.codeVectorizationService.deleteFileVectors(filePath);
    
    // Vectorize the file
    await this.codeVectorizationService.vectorizeFile(filePath);
  }

  /**
   * Delete vectors for a file
   */
  private async deleteFileVectors(filePath: string): Promise<void> {
    if (!this.codeVectorizationService.isReady()) {
      throw new Error('Code vectorization service not ready');
    }

    await this.codeVectorizationService.deleteFileVectors(filePath);
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isWatching: boolean;
    isProcessing: boolean;
    queueSize: number;
    projectPath: string | null;
  } {
    const watcherStatus = unifiedFileWatcher.getStatus();
    const isSubscribed = watcherStatus.subscribers.includes(this.subscriberId);
    
    return {
      isWatching: isSubscribed && watcherStatus.isWatching,
      isProcessing: this.isProcessing,
      queueSize: this.changeQueue.size,
      projectPath: this.projectPath,
    };
  }

  /**
   * Update watcher options
   */
  updateOptions(options: Partial<FileWatcherOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Update debounce if delay changed
    if (options.debounceDelay) {
      this.processQueueDebounced = debounce(
        () => this.processChangeQueue(),
        options.debounceDelay
      );
    }
    
    // Restart watcher if patterns changed and currently watching
    if ((options.patterns || options.ignorePatterns) && this.projectPath && this.getStatus().isWatching) {
      this.start(this.projectPath, this.options);
    }
  }
}

// Export singleton instance
export const codeFileWatcher = CodeFileWatcherService.getInstance();