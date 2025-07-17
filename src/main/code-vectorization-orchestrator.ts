import { EventEmitter } from 'events';
import { CodeVectorizationService } from './code-vectorization-service';
import { CodeFileWatcherService } from './code-file-watcher-service';
import { CodeGitSyncService } from './code-git-sync-service';

export interface VectorizationProgress {
  phase: 'idle' | 'initializing' | 'scanning' | 'vectorizing' | 'watching';
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  errors: number;
  startTime: Date;
  estimatedTimeRemaining?: number;
}

export interface VectorizationStatus {
  isInitialized: boolean;
  isVectorizing: boolean;
  isWatching: boolean;
  progress: VectorizationProgress;
  stats: {
    totalFiles: number;
    vectorizedFiles: number;
    totalElements: number;
    vectorizedElements: number;
    lastSync: Date | null;
  };
}

export class CodeVectorizationOrchestrator extends EventEmitter {
  private static instance: CodeVectorizationOrchestrator;
  private vectorizationService: CodeVectorizationService;
  private fileWatcherService: CodeFileWatcherService;
  private gitSyncService: CodeGitSyncService;
  private projectPath: string | null = null;
  private progress: VectorizationProgress;
  private isInitialized: boolean = false;

  private constructor() {
    super();
    this.vectorizationService = CodeVectorizationService.getInstance();
    this.fileWatcherService = CodeFileWatcherService.getInstance();
    this.gitSyncService = CodeGitSyncService.getInstance();
    
    this.progress = {
      phase: 'idle',
      filesProcessed: 0,
      totalFiles: 0,
      errors: 0,
      startTime: new Date(),
    };

    this.setupEventListeners();
  }

  static getInstance(): CodeVectorizationOrchestrator {
    if (!CodeVectorizationOrchestrator.instance) {
      CodeVectorizationOrchestrator.instance = new CodeVectorizationOrchestrator();
    }
    return CodeVectorizationOrchestrator.instance;
  }

  /**
   * Initialize the orchestrator for a project
   */
  async initialize(projectPath: string): Promise<void> {
    if (this.isInitialized && this.projectPath === projectPath) {
      console.log('[CODE-ORCHESTRATOR] Already initialized for this project');
      return;
    }

    this.projectPath = projectPath;
    this.updateProgress({ phase: 'initializing' });

    try {
      // Initialize vectorization service
      await this.vectorizationService.initialize(projectPath);
      
      // Start git sync service
      await this.gitSyncService.start(projectPath);
      
      this.isInitialized = true;
      this.updateProgress({ phase: 'idle' });
      this.emit('initialized', { projectPath });
      
      console.log('[CODE-ORCHESTRATOR] Initialized successfully');
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR] Initialization failed:', error);
      this.updateProgress({ phase: 'idle' });
      throw error;
    }
  }

  /**
   * Start initial project vectorization
   */
  async vectorizeProject(filePatterns?: string[], concurrency: number = 4): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    console.log('[CODE-ORCHESTRATOR] Starting project vectorization');
    this.updateProgress({
      phase: 'scanning',
      filesProcessed: 0,
      totalFiles: 0,
      errors: 0,
      startTime: new Date(),
    });

    try {
      // First, count files to vectorize
      const filesToProcess = await this.countFilesToProcess(filePatterns);
      this.updateProgress({
        phase: 'vectorizing',
        totalFiles: filesToProcess,
      });

      // Vectorize the project with specified concurrency
      await this.vectorizationService.vectorizeProject(filePatterns, concurrency);

      // Get final stats
      const stats = await this.vectorizationService.getStats();
      this.updateProgress({
        phase: 'idle',
        filesProcessed: stats.vectorizedFiles,
        totalFiles: stats.vectorizedFiles,
      });

      this.emit('vectorizationComplete', {
        filesProcessed: stats.vectorizedFiles,
        elementsVectorized: stats.vectorizedElements,
      });

      // Start watching for changes
      await this.startWatching();
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR] Vectorization failed:', error);
      this.updateProgress({ phase: 'idle' });
      throw error;
    }
  }

  /**
   * Start watching for file changes
   */
  async startWatching(): Promise<void> {
    if (!this.isInitialized || !this.projectPath) {
      throw new Error('Orchestrator not initialized');
    }

    console.log('[CODE-ORCHESTRATOR] Starting file watcher');
    this.updateProgress({ phase: 'watching' });

    await this.fileWatcherService.start(this.projectPath);
    this.emit('watchingStarted');
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    console.log('[CODE-ORCHESTRATOR] Stopping file watcher');
    await this.fileWatcherService.stop();
    this.updateProgress({ phase: 'idle' });
    this.emit('watchingStopped');
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<VectorizationStatus> {
    const stats = await this.vectorizationService.getStats();
    const watcherStatus = this.fileWatcherService.getStatus();
    const gitStatus = this.gitSyncService.getStatus();

    return {
      isInitialized: this.isInitialized,
      isVectorizing: this.vectorizationService.isVectorizing() || this.progress.phase === 'vectorizing',
      isWatching: watcherStatus.isWatching,
      progress: { ...this.progress },
      stats: {
        totalFiles: stats.totalFiles,
        vectorizedFiles: stats.vectorizedFiles,
        totalElements: stats.totalElements,
        vectorizedElements: stats.vectorizedElements,
        lastSync: stats.lastSync,
      },
    };
  }

  /**
   * Setup event listeners for child services
   */
  private setupEventListeners(): void {
    // File watcher events
    this.fileWatcherService.on('fileChange', (event) => {
      this.emit('fileChange', event);
    });

    this.fileWatcherService.on('processingStart', (data) => {
      this.updateProgress({
        phase: 'vectorizing',
        totalFiles: data.count,
        filesProcessed: 0,
      });
      this.emit('incrementalUpdateStart', data);
    });

    this.fileWatcherService.on('fileProcessed', (data) => {
      if (data.success) {
        this.updateProgress({
          filesProcessed: this.progress.filesProcessed + 1,
        });
      } else {
        this.updateProgress({
          errors: this.progress.errors + 1,
        });
      }
      this.emit('fileProcessed', data);
    });

    this.fileWatcherService.on('processingComplete', (results) => {
      this.updateProgress({ phase: 'watching' });
      this.emit('incrementalUpdateComplete', results);
    });

    // Git sync events
    this.gitSyncService.on('branchChanged', (event) => {
      this.emit('branchChanged', event);
    });

    this.gitSyncService.on('reindexingStart', (event) => {
      this.updateProgress({ phase: 'vectorizing' });
      this.emit('branchReindexStart', event);
    });

    this.gitSyncService.on('reindexingProgress', (data) => {
      this.updateProgress({
        filesProcessed: data.current,
        totalFiles: data.total,
        currentFile: data.file,
      });
      this.emit('branchReindexProgress', data);
    });

    this.gitSyncService.on('reindexingComplete', (data) => {
      this.updateProgress({ phase: 'watching' });
      this.emit('branchReindexComplete', data);
    });
  }

  /**
   * Update progress and emit event
   */
  private updateProgress(updates: Partial<VectorizationProgress>): void {
    this.progress = { ...this.progress, ...updates };
    
    // Calculate estimated time remaining
    if (this.progress.phase === 'vectorizing' && 
        this.progress.filesProcessed > 0 && 
        this.progress.totalFiles > 0) {
      const elapsedMs = Date.now() - this.progress.startTime.getTime();
      const filesRemaining = this.progress.totalFiles - this.progress.filesProcessed;
      const msPerFile = elapsedMs / this.progress.filesProcessed;
      this.progress.estimatedTimeRemaining = Math.round(filesRemaining * msPerFile);
    }

    this.emit('progressUpdate', this.progress);
  }

  /**
   * Count files to process
   */
  private async countFilesToProcess(filePatterns?: string[]): Promise<number> {
    if (!this.projectPath) return 0;

    const patterns = filePatterns || [
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    ];

    const { glob } = await import('glob');
    let totalCount = 0;

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: this.projectPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
      totalCount += files.length;
    }

    return totalCount;
  }

  /**
   * Force reindex of entire project
   */
  async forceReindex(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    console.log('[CODE-ORCHESTRATOR] Forcing full reindex');
    await this.gitSyncService.forceFullReindex();
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[CODE-ORCHESTRATOR] Shutting down');
    
    await this.fileWatcherService.stop();
    this.gitSyncService.stop();
    
    this.isInitialized = false;
    this.projectPath = null;
    this.updateProgress({ phase: 'idle' });
    
    this.emit('shutdown');
  }
}