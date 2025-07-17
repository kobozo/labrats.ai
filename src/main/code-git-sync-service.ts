import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from './gitService';
import { CodeVectorizationService } from './code-vectorization-service';
import { CodeFileWatcherService } from './code-file-watcher-service';

interface BranchChangeEvent {
  previousBranch: string;
  currentBranch: string;
  timestamp: Date;
}

export class CodeGitSyncService extends EventEmitter {
  private static instance: CodeGitSyncService;
  private gitService: GitService;
  private codeVectorizationService: CodeVectorizationService;
  private fileWatcherService: CodeFileWatcherService;
  private projectPath: string | null = null;
  private currentBranch: string | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private isReindexing: boolean = false;

  private constructor() {
    super();
    this.gitService = new GitService();
    this.codeVectorizationService = CodeVectorizationService.getInstance();
    this.fileWatcherService = CodeFileWatcherService.getInstance();
  }

  static getInstance(): CodeGitSyncService {
    if (!CodeGitSyncService.instance) {
      CodeGitSyncService.instance = new CodeGitSyncService();
    }
    return CodeGitSyncService.instance;
  }

  /**
   * Start monitoring git branch changes
   */
  async start(projectPath: string): Promise<void> {
    this.projectPath = projectPath;

    // Get initial branch
    try {
      await this.gitService.initializeRepo(projectPath);
      const branches = await this.gitService.getBranches();
      this.currentBranch = branches.current;
      console.log('[CODE-GIT-SYNC] Starting on branch:', this.currentBranch);
    } catch (error) {
      console.error('[CODE-GIT-SYNC] Failed to get initial branch:', error);
      this.currentBranch = 'unknown';
    }

    // Start periodic branch checking
    this.checkInterval = setInterval(() => {
      this.checkForBranchChange();
    }, 2000); // Check every 2 seconds

    this.emit('started', { branch: this.currentBranch });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.emit('stopped');
  }

  /**
   * Check for branch changes
   */
  private async checkForBranchChange(): Promise<void> {
    if (!this.projectPath || this.isReindexing) return;

    try {
      const branches = await this.gitService.getBranches();
      
      if (branches.current !== this.currentBranch) {
        const event: BranchChangeEvent = {
          previousBranch: this.currentBranch || 'unknown',
          currentBranch: branches.current,
          timestamp: new Date(),
        };
        
        console.log(`[CODE-GIT-SYNC] Branch changed from ${event.previousBranch} to ${event.currentBranch}`);
        this.currentBranch = branches.current;
        
        this.emit('branchChanged', event);
        await this.handleBranchChange(event);
      }
    } catch (error) {
      // Silently ignore errors during periodic checks
    }
  }

  /**
   * Handle branch change by reindexing affected files
   */
  private async handleBranchChange(event: BranchChangeEvent): Promise<void> {
    if (this.isReindexing || !this.projectPath) return;

    this.isReindexing = true;
    this.emit('reindexingStart', event);

    try {
      // Stop file watcher temporarily
      await this.fileWatcherService.stop();

      // Get list of changed files between branches
      const changedFiles = await this.getChangedFilesBetweenBranches(
        event.previousBranch,
        event.currentBranch
      );

      console.log(`[CODE-GIT-SYNC] Found ${changedFiles.length} changed files`);

      // Process changed files
      let processed = 0;
      for (const file of changedFiles) {
        try {
          const absolutePath = path.join(this.projectPath, file.path);
          
          if (file.status === 'deleted') {
            await this.codeVectorizationService.deleteFileVectors(absolutePath);
          } else {
            // Check if file is a code file we care about
            if (this.isCodeFile(file.path)) {
              await this.codeVectorizationService.deleteFileVectors(absolutePath);
              await this.codeVectorizationService.vectorizeFile(absolutePath);
            }
          }
          
          processed++;
          this.emit('reindexingProgress', {
            current: processed,
            total: changedFiles.length,
            file: file.path,
          });
        } catch (error) {
          console.error(`[CODE-GIT-SYNC] Failed to process ${file.path}:`, error);
        }
      }

      // Restart file watcher
      await this.fileWatcherService.start(this.projectPath);

      this.emit('reindexingComplete', {
        filesProcessed: processed,
        totalFiles: changedFiles.length,
      });
    } catch (error) {
      console.error('[CODE-GIT-SYNC] Reindexing failed:', error);
      this.emit('reindexingError', error);
    } finally {
      this.isReindexing = false;
    }
  }

  /**
   * Get list of files changed between two branches
   */
  private async getChangedFilesBetweenBranches(
    fromBranch: string,
    toBranch: string
  ): Promise<Array<{ path: string; status: 'modified' | 'added' | 'deleted' }>> {
    if (!this.projectPath) return [];

    try {
      // Use git diff to get changed files
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Get diff between branches
      const { stdout } = await execAsync(
        `git diff --name-status ${fromBranch}...${toBranch}`,
        { cwd: this.projectPath }
      );

      const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted' }> = [];
      const lines = stdout.split('\n').filter((line: string) => line.trim());

      for (const line of lines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');
        
        if (!filePath) continue;

        let fileStatus: 'modified' | 'added' | 'deleted' = 'modified';
        if (status === 'A') fileStatus = 'added';
        else if (status === 'D') fileStatus = 'deleted';
        
        files.push({ path: filePath, status: fileStatus });
      }

      return files;
    } catch (error) {
      console.error('[CODE-GIT-SYNC] Failed to get changed files:', error);
      // Fallback: return empty array
      return [];
    }
  }

  /**
   * Check if a file is a code file we should index
   */
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      // TypeScript/JavaScript
      '.ts', '.tsx', '.js', '.jsx',
      // Python
      '.py', '.pyw',
      // Java
      '.java',
      // Go
      '.go',
      // C/C++
      '.cpp', '.c', '.cc', '.cxx', '.h', '.hpp',
      // Rust
      '.rs',
      // Swift
      '.swift',
      // Kotlin
      '.kt', '.kts',
      // Ruby
      '.rb',
      // PHP
      '.php',
      // C#
      '.cs',
      // Other
      '.dart', '.scala', '.lua', '.r', '.m', '.mm',
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return codeExtensions.includes(ext);
  }

  /**
   * Get current status
   */
  getStatus(): {
    isMonitoring: boolean;
    isReindexing: boolean;
    currentBranch: string | null;
    projectPath: string | null;
  } {
    return {
      isMonitoring: this.checkInterval !== null,
      isReindexing: this.isReindexing,
      currentBranch: this.currentBranch,
      projectPath: this.projectPath,
    };
  }

  /**
   * Force a reindex of all code files
   */
  async forceFullReindex(): Promise<void> {
    if (!this.projectPath || this.isReindexing) {
      throw new Error('Cannot reindex: service not ready or already reindexing');
    }

    this.isReindexing = true;
    this.emit('fullReindexStart');

    try {
      // Stop file watcher
      await this.fileWatcherService.stop();

      // Clear all existing vectors
      const stats = await this.codeVectorizationService.getStats();
      console.log(`[CODE-GIT-SYNC] Clearing ${stats.vectorizedElements} existing vectors`);

      // Reindex entire project
      await this.codeVectorizationService.vectorizeProject();

      // Restart file watcher
      await this.fileWatcherService.start(this.projectPath);

      const newStats = await this.codeVectorizationService.getStats();
      this.emit('fullReindexComplete', {
        vectorizedElements: newStats.vectorizedElements,
        vectorizedFiles: newStats.vectorizedFiles,
      });
    } catch (error) {
      console.error('[CODE-GIT-SYNC] Full reindex failed:', error);
      this.emit('fullReindexError', error);
      throw error;
    } finally {
      this.isReindexing = false;
    }
  }
}