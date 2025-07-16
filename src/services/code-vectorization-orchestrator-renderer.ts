import { BrowserEventEmitter } from './browser-event-emitter';

// Copy interfaces to avoid importing from main process
export interface VectorizationProgress {
  phase: string;
  filesProcessed: number;
  totalFiles: number;
  currentFile: string | null;
  errors: number;
  estimatedTimeRemaining: number | null;
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

export interface OrchestratorEventHandlers {
  onInitialized?: (data: { projectPath: string }) => void;
  onVectorizationComplete?: (data: { filesProcessed: number; elementsVectorized: number }) => void;
  onWatchingStarted?: () => void;
  onWatchingStopped?: () => void;
  onFileChange?: (event: any) => void;
  onIncrementalUpdateStart?: (data: { count: number }) => void;
  onFileProcessed?: (data: { filePath: string; type: string; success: boolean; error?: string }) => void;
  onIncrementalUpdateComplete?: (results: { successful: number; failed: number; deleted: number }) => void;
  onBranchChanged?: (event: { previousBranch: string; currentBranch: string }) => void;
  onBranchReindexStart?: (event: any) => void;
  onBranchReindexProgress?: (data: { current: number; total: number; file: string }) => void;
  onBranchReindexComplete?: (data: { filesProcessed: number; totalFiles: number }) => void;
  onProgressUpdate?: (progress: VectorizationProgress) => void;
  onShutdown?: () => void;
}

class CodeVectorizationOrchestratorRenderer extends BrowserEventEmitter {
  private static instance: CodeVectorizationOrchestratorRenderer;
  private eventListeners: Map<string, Function> = new Map();

  private constructor() {
    super();
    this.setupEventListeners();
  }

  static getInstance(): CodeVectorizationOrchestratorRenderer {
    if (!CodeVectorizationOrchestratorRenderer.instance) {
      CodeVectorizationOrchestratorRenderer.instance = new CodeVectorizationOrchestratorRenderer();
    }
    return CodeVectorizationOrchestratorRenderer.instance;
  }

  /**
   * Initialize the orchestrator for a project
   */
  async initialize(projectPath: string): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.initialize(projectPath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to initialize orchestrator');
    }
  }

  /**
   * Start project vectorization
   */
  async vectorizeProject(filePatterns?: string[], concurrency?: number): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.vectorizeProject(filePatterns, concurrency);
    if (!result.success) {
      throw new Error(result.error || 'Failed to vectorize project');
    }
  }

  /**
   * Start watching for file changes
   */
  async startWatching(): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.startWatching();
    if (!result.success) {
      throw new Error(result.error || 'Failed to start watching');
    }
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.stopWatching();
    if (!result.success) {
      throw new Error(result.error || 'Failed to stop watching');
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<VectorizationStatus> {
    const result = await window.electronAPI.codeOrchestrator!.getStatus();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get status');
    }
    return result.status;
  }

  /**
   * Force reindex of entire project
   */
  async forceReindex(): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.forceReindex();
    if (!result.success) {
      throw new Error(result.error || 'Failed to force reindex');
    }
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown(): Promise<void> {
    const result = await window.electronAPI.codeOrchestrator!.shutdown();
    if (!result.success) {
      throw new Error(result.error || 'Failed to shutdown');
    }
  }

  /**
   * Register event handlers
   */
  registerEventHandlers(handlers: OrchestratorEventHandlers): void {
    Object.entries(handlers).forEach(([event, handler]) => {
      const eventName = event.replace(/^on/, '').charAt(0).toLowerCase() + event.slice(3);
      this.on(eventName, handler);
    });
  }

  /**
   * Unregister all event handlers
   */
  unregisterAllEventHandlers(): void {
    this.removeAllListeners();
    this.setupEventListeners(); // Re-setup IPC listeners
  }

  /**
   * Setup IPC event listeners
   */
  private setupEventListeners(): void {
    const events = [
      'initialized',
      'vectorizationComplete',
      'watchingStarted',
      'watchingStopped',
      'fileChange',
      'incrementalUpdateStart',
      'fileProcessed',
      'incrementalUpdateComplete',
      'branchChanged',
      'branchReindexStart',
      'branchReindexProgress',
      'branchReindexComplete',
      'progressUpdate',
      'shutdown',
    ];

    events.forEach(eventName => {
      const listener = (_event: any, data: any) => {
        this.emit(eventName, data);
      };
      
      // Remove existing listener if any
      if (this.eventListeners.has(eventName)) {
        window.electronAPI.ipcRenderer!.removeListener(
          `code-orchestrator:${eventName}`,
          this.eventListeners.get(eventName) as (event: any, ...args: any[]) => void
        );
      }
      
      // Add new listener
      window.electronAPI.ipcRenderer!.on(`code-orchestrator:${eventName}`, listener);
      this.eventListeners.set(eventName, listener);
    });
  }

  /**
   * Cleanup listeners
   */
  cleanup(): void {
    this.eventListeners.forEach((listener, eventName) => {
      window.electronAPI.ipcRenderer!.removeListener(
        `code-orchestrator:${eventName}`,
        listener as (event: any, ...args: any[]) => void
      );
    });
    this.eventListeners.clear();
    this.removeAllListeners();
  }
}

export const codeVectorizationOrchestrator = CodeVectorizationOrchestratorRenderer.getInstance();