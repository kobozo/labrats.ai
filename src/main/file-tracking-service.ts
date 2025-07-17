import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { unifiedFileWatcher, FileChangeEvent } from './unified-file-watcher-service';

export interface FileTrackingEntry {
  fileHash: string;
  lastModified: string;
  lastChecked: string;
  fileSize: number;
}

export interface FileTrackingState {
  version: string;
  projectPath: string;
  files: { [filePath: string]: FileTrackingEntry };
  lastUpdated: string;
}

/**
 * Service that tracks file changes for the entire project
 * Used by watchdog services to detect files changed outside the app
 */
export class FileTrackingService {
  private static instance: FileTrackingService;
  private projectPath: string | null = null;
  private trackingState: Map<string, FileTrackingEntry> = new Map();
  private isInitialized: boolean = false;
  private filePatterns: string[] = [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml',
    '**/*.css', '**/*.scss', '**/*.sass', '**/*.less',
    '**/*.html', '**/*.xml', '**/*.vue', '**/*.svelte'
  ];

  private constructor() {}

  static getInstance(): FileTrackingService {
    if (!FileTrackingService.instance) {
      FileTrackingService.instance = new FileTrackingService();
    }
    return FileTrackingService.instance;
  }

  /**
   * Initialize the file tracking service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    console.log('[FILE-TRACKING] Initializing for project:', projectPath);
    this.projectPath = projectPath;
    
    // Load existing tracking state
    await this.loadTrackingState();
    
    // Subscribe to file watcher
    unifiedFileWatcher.subscribe('file-tracking', this.filePatterns, this.handleFileChange.bind(this));
    
    // Start watching
    await unifiedFileWatcher.start(projectPath);
    
    this.isInitialized = true;
    console.log('[FILE-TRACKING] Initialized with', this.trackingState.size, 'tracked files');
  }

  /**
   * Get the path to the tracking state file
   */
  private getTrackingStatePath(): string {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }
    return path.join(this.projectPath, '.labrats', 'file-tracker.json');
  }

  /**
   * Load tracking state from disk
   */
  private async loadTrackingState(): Promise<void> {
    try {
      const statePath = this.getTrackingStatePath();
      if (fs.existsSync(statePath)) {
        const content = await fs.promises.readFile(statePath, 'utf-8');
        const state = JSON.parse(content) as FileTrackingState;
        
        // Convert to Map
        this.trackingState.clear();
        for (const [filePath, entry] of Object.entries(state.files)) {
          this.trackingState.set(filePath, entry);
        }
        
        console.log('[FILE-TRACKING] Loaded tracking state with', this.trackingState.size, 'files');
      }
    } catch (error) {
      console.error('[FILE-TRACKING] Failed to load tracking state:', error);
    }
  }

  /**
   * Save tracking state to disk
   */
  private async saveTrackingState(): Promise<void> {
    if (!this.projectPath) return;
    
    try {
      const statePath = this.getTrackingStatePath();
      const stateDir = path.dirname(statePath);
      
      // Ensure directory exists
      if (!fs.existsSync(stateDir)) {
        await fs.promises.mkdir(stateDir, { recursive: true });
      }
      
      // Convert Map to object
      const files: { [filePath: string]: FileTrackingEntry } = {};
      for (const [filePath, entry] of this.trackingState) {
        files[filePath] = entry;
      }
      
      const state: FileTrackingState = {
        version: '1.0',
        projectPath: this.projectPath,
        files,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.error('[FILE-TRACKING] Failed to save tracking state:', error);
    }
  }

  /**
   * Calculate file hash
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Handle file change events from the watcher
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    const { type, filePath } = event;
    
    try {
      if (type === 'unlink') {
        // File deleted
        this.trackingState.delete(filePath);
        console.log('[FILE-TRACKING] File deleted:', filePath);
      } else if (type === 'add' || type === 'change') {
        // File added or changed
        const stats = await fs.promises.stat(filePath);
        const fileHash = await this.calculateFileHash(filePath);
        
        const entry: FileTrackingEntry = {
          fileHash,
          lastModified: stats.mtime.toISOString(),
          lastChecked: new Date().toISOString(),
          fileSize: stats.size
        };
        
        this.trackingState.set(filePath, entry);
        console.log('[FILE-TRACKING] File', type === 'add' ? 'added' : 'changed', ':', filePath);
      }
      
      // Save state after each change
      await this.saveTrackingState();
    } catch (error) {
      console.error('[FILE-TRACKING] Error handling file change:', error);
    }
  }

  /**
   * Check if a file has changed since last tracked
   */
  async hasFileChanged(filePath: string): Promise<boolean> {
    const tracked = this.trackingState.get(filePath);
    if (!tracked) return true; // Not tracked means it's new
    
    try {
      const stats = await fs.promises.stat(filePath);
      const currentHash = await this.calculateFileHash(filePath);
      
      return currentHash !== tracked.fileHash;
    } catch (error) {
      // File might not exist anymore
      return true;
    }
  }

  /**
   * Update file tracking info
   */
  async updateFileTracking(filePath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(filePath);
      const fileHash = await this.calculateFileHash(filePath);
      
      const entry: FileTrackingEntry = {
        fileHash,
        lastModified: stats.mtime.toISOString(),
        lastChecked: new Date().toISOString(),
        fileSize: stats.size
      };
      
      this.trackingState.set(filePath, entry);
      await this.saveTrackingState();
    } catch (error) {
      console.error('[FILE-TRACKING] Failed to update tracking for:', filePath, error);
    }
  }

  /**
   * Get files changed outside the app (based on file modification time vs last checked time)
   */
  async getExternallyChangedFiles(): Promise<string[]> {
    const changedFiles: string[] = [];
    
    for (const [filePath, tracked] of this.trackingState) {
      try {
        const stats = await fs.promises.stat(filePath);
        const lastModified = new Date(stats.mtime);
        const lastChecked = new Date(tracked.lastChecked);
        
        // If file was modified after we last checked it, it was changed externally
        if (lastModified > lastChecked) {
          changedFiles.push(filePath);
        }
      } catch (error) {
        // File might have been deleted
        continue;
      }
    }
    
    return changedFiles;
  }

  /**
   * Scan all project files and update tracking
   */
  async scanProject(): Promise<void> {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }
    
    console.log('[FILE-TRACKING] Starting full project scan...');
    const startTime = Date.now();
    
    const { glob } = await import('glob');
    const allFiles: string[] = [];
    
    // Find all files matching patterns
    for (const pattern of this.filePatterns) {
      const matches = await glob(pattern, {
        cwd: this.projectPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**', '**/.labrats/**'],
      });
      allFiles.push(...matches);
    }
    
    // Remove duplicates
    const uniqueFiles = [...new Set(allFiles)];
    console.log('[FILE-TRACKING] Found', uniqueFiles.length, 'files to track');
    
    // Update tracking for all files
    for (const filePath of uniqueFiles) {
      await this.updateFileTracking(filePath);
    }
    
    // Remove tracking for files that no longer exist
    const trackedFiles = Array.from(this.trackingState.keys());
    for (const trackedFile of trackedFiles) {
      if (!uniqueFiles.includes(trackedFile)) {
        this.trackingState.delete(trackedFile);
        console.log('[FILE-TRACKING] Removed tracking for deleted file:', trackedFile);
      }
    }
    
    await this.saveTrackingState();
    
    const duration = Date.now() - startTime;
    console.log('[FILE-TRACKING] Full scan completed in', duration, 'ms');
  }

  /**
   * Get tracking info for a specific file
   */
  getFileTracking(filePath: string): FileTrackingEntry | undefined {
    return this.trackingState.get(filePath);
  }

  /**
   * Get all tracked files
   */
  getAllTrackedFiles(): Map<string, FileTrackingEntry> {
    return new Map(this.trackingState);
  }

  /**
   * Clear all tracking data
   */
  async clearTracking(): Promise<void> {
    this.trackingState.clear();
    await this.saveTrackingState();
    console.log('[FILE-TRACKING] Cleared all tracking data');
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    console.log('[FILE-TRACKING] Shutting down...');
    
    // Unsubscribe from file watcher
    unifiedFileWatcher.unsubscribe('file-tracking');
    
    // Save final state
    await this.saveTrackingState();
    
    this.isInitialized = false;
    console.log('[FILE-TRACKING] Shutdown complete');
  }
}

export const fileTrackingService = FileTrackingService.getInstance();