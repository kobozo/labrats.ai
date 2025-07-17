import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as chokidar from 'chokidar';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  timestamp: Date;
}

export interface FileWatcherConfig {
  patterns?: string[];
  ignorePatterns?: string[];
  debounceDelay?: number;
}

export interface FileWatcherSubscriber {
  id: string;
  patterns?: string[];
  handler: (event: FileChangeEvent) => void;
}

/**
 * Unified file watcher service that manages file watching for multiple subscribers
 */
export class UnifiedFileWatcherService extends EventEmitter {
  private static instance: UnifiedFileWatcherService;
  private watcher: chokidar.FSWatcher | null = null;
  private projectPath: string | null = null;
  private subscribers: Map<string, FileWatcherSubscriber> = new Map();
  private isWatching: boolean = false;

  private readonly DEFAULT_IGNORE = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/tmp/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/vendor/**',
    '**/__pycache__/**',
    '**/.pytest_cache/**',
    '**/target/**',
    '**/bin/**',
    '**/obj/**',
  ];

  private constructor() {
    super();
  }

  static getInstance(): UnifiedFileWatcherService {
    if (!UnifiedFileWatcherService.instance) {
      UnifiedFileWatcherService.instance = new UnifiedFileWatcherService();
    }
    return UnifiedFileWatcherService.instance;
  }

  /**
   * Register a subscriber for file changes
   */
  subscribe(id: string, patterns: string[], handler: (event: FileChangeEvent) => void): void {
    console.log(`[UNIFIED-FILE-WATCHER] Subscriber registered: ${id}`);
    
    this.subscribers.set(id, {
      id,
      patterns,
      handler,
    });

    // If watcher is already running, no need to restart
    if (this.isWatching && this.projectPath) {
      console.log(`[UNIFIED-FILE-WATCHER] Watcher already active, subscriber ${id} added to existing watch`);
    }
  }

  /**
   * Unregister a subscriber
   */
  unsubscribe(id: string): void {
    console.log(`[UNIFIED-FILE-WATCHER] Subscriber unregistered: ${id}`);
    this.subscribers.delete(id);

    // If no more subscribers, stop watching
    if (this.subscribers.size === 0 && this.isWatching) {
      console.log('[UNIFIED-FILE-WATCHER] No more subscribers, stopping watcher');
      this.stop();
    }
  }

  /**
   * Start watching files for the project
   */
  async start(projectPath: string): Promise<void> {
    if (this.isWatching && this.projectPath === projectPath) {
      console.log('[UNIFIED-FILE-WATCHER] Already watching this project');
      return;
    }

    // Stop existing watcher if any
    if (this.watcher) {
      await this.stop();
    }

    this.projectPath = projectPath;

    // Collect all patterns from subscribers
    const allPatterns = new Set<string>();
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.patterns) {
        subscriber.patterns.forEach(pattern => allPatterns.add(pattern));
      }
    }

    // If no patterns, don't start
    if (allPatterns.size === 0) {
      console.log('[UNIFIED-FILE-WATCHER] No patterns to watch');
      return;
    }

    console.log('[UNIFIED-FILE-WATCHER] Starting watcher for:', projectPath);
    console.log('[UNIFIED-FILE-WATCHER] Patterns:', Array.from(allPatterns));

    // Create chokidar watcher
    this.watcher = chokidar.watch(Array.from(allPatterns), {
      cwd: projectPath,
      ignored: this.DEFAULT_IGNORE,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher
      .on('add', (filePath) => this.handleFileChange('add', filePath))
      .on('change', (filePath) => this.handleFileChange('change', filePath))
      .on('unlink', (filePath) => this.handleFileChange('unlink', filePath))
      .on('error', (error) => {
        console.error('[UNIFIED-FILE-WATCHER] Watcher error:', error);
        this.emit('error', error);
      })
      .on('ready', () => {
        console.log('[UNIFIED-FILE-WATCHER] Ready and watching for changes');
        this.isWatching = true;
        this.emit('ready');
      });
  }

  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      console.log('[UNIFIED-FILE-WATCHER] Stopped watching files');
    }
  }

  /**
   * Handle file change events
   */
  private handleFileChange(type: FileChangeEvent['type'], relativePath: string): void {
    if (!this.projectPath) return;

    const absolutePath = path.join(this.projectPath, relativePath);
    const event: FileChangeEvent = {
      type,
      filePath: absolutePath,
      timestamp: new Date(),
    };

    console.log(`[UNIFIED-FILE-WATCHER] File ${type}: ${relativePath}`);

    // Notify relevant subscribers
    for (const subscriber of this.subscribers.values()) {
      if (this.matchesSubscriberPatterns(relativePath, subscriber)) {
        try {
          subscriber.handler(event);
        } catch (error) {
          console.error(`[UNIFIED-FILE-WATCHER] Error in subscriber ${subscriber.id}:`, error);
        }
      }
    }

    // Emit global event
    this.emit('fileChange', event);
  }

  /**
   * Check if a file matches subscriber patterns
   */
  private matchesSubscriberPatterns(filePath: string, subscriber: FileWatcherSubscriber): boolean {
    if (!subscriber.patterns || subscriber.patterns.length === 0) {
      return true; // No patterns means watch all
    }

    const ext = path.extname(filePath).toLowerCase();
    
    // Check if any pattern matches
    return subscriber.patterns.some(pattern => {
      if (pattern.startsWith('**/')) {
        // Handle glob patterns
        const fileExt = pattern.substring(3);
        return fileExt === `*${ext}`;
      } else if (pattern.startsWith('*.')) {
        // Handle simple extension patterns
        return pattern === `*${ext}`;
      } else {
        // Handle exact matches
        return filePath.includes(pattern);
      }
    });
  }

  /**
   * Get current status
   */
  getStatus(): {
    isWatching: boolean;
    projectPath: string | null;
    subscriberCount: number;
    subscribers: string[];
  } {
    return {
      isWatching: this.isWatching,
      projectPath: this.projectPath,
      subscriberCount: this.subscribers.size,
      subscribers: Array.from(this.subscribers.keys()),
    };
  }

  /**
   * Restart the watcher (useful when patterns change)
   */
  async restart(): Promise<void> {
    if (this.projectPath && this.isWatching) {
      const projectPath = this.projectPath;
      await this.stop();
      await this.start(projectPath);
    }
  }
}

export const unifiedFileWatcher = UnifiedFileWatcherService.getInstance();