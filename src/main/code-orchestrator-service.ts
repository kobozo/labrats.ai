import { CodeVectorizationService } from './code-vectorization-service';
import { fileTrackingService } from './file-tracking-service';

/**
 * Orchestrator service that coordinates code vectorization, file tracking, and other services
 */
export class CodeOrchestratorService {
  private static instance: CodeOrchestratorService;
  private codeVectorization: CodeVectorizationService;
  private isInitialized: boolean = false;
  private currentProject: string | null = null;

  private constructor() {
    this.codeVectorization = CodeVectorizationService.getInstance();
  }

  static getInstance(): CodeOrchestratorService {
    if (!CodeOrchestratorService.instance) {
      CodeOrchestratorService.instance = new CodeOrchestratorService();
    }
    return CodeOrchestratorService.instance;
  }

  /**
   * Initialize all services for a project
   */
  async initialize(projectPath: string): Promise<void> {
    console.log('[CODE-ORCHESTRATOR] Initializing services for project:', projectPath);
    this.currentProject = projectPath;
    
    try {
      // Initialize file tracking service first
      await fileTrackingService.initialize(projectPath);
      console.log('[CODE-ORCHESTRATOR] File tracking service initialized');
      
      // Initialize code vectorization service
      await this.codeVectorization.initialize(projectPath);
      console.log('[CODE-ORCHESTRATOR] Code vectorization service initialized');
      
      // Auto scanner initialization moved to a separate service
      // to avoid circular dependencies
      console.log('[CODE-ORCHESTRATOR] TODO auto scanner should be started from renderer');
      
      this.isInitialized = true;
      console.log('[CODE-ORCHESTRATOR] All services initialized successfully');
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR] Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Get files that were changed outside the app
   */
  async getExternallyChangedFiles(): Promise<string[]> {
    if (!this.isInitialized) {
      return [];
    }
    
    return await fileTrackingService.getExternallyChangedFiles();
  }

  /**
   * Re-vectorize files that were changed outside the app
   */
  async vectorizeExternallyChangedFiles(): Promise<void> {
    if (!this.isInitialized || !this.currentProject) {
      console.warn('[CODE-ORCHESTRATOR] Service not initialized');
      return;
    }
    
    const changedFiles = await this.getExternallyChangedFiles();
    if (changedFiles.length === 0) {
      console.log('[CODE-ORCHESTRATOR] No externally changed files found');
      return;
    }
    
    console.log('[CODE-ORCHESTRATOR] Re-vectorizing', changedFiles.length, 'externally changed files');
    
    for (const filePath of changedFiles) {
      try {
        // Check if it's a code file that should be vectorized
        const ext = filePath.toLowerCase();
        if (ext.endsWith('.ts') || ext.endsWith('.tsx') || ext.endsWith('.js') || ext.endsWith('.jsx')) {
          await this.codeVectorization.vectorizeFile(filePath, true); // Force re-vectorization
          console.log('[CODE-ORCHESTRATOR] Re-vectorized:', filePath);
        }
        
        // Update file tracking to mark it as checked
        await fileTrackingService.updateFileTracking(filePath);
      } catch (error) {
        console.error('[CODE-ORCHESTRATOR] Failed to re-vectorize file:', filePath, error);
      }
    }
  }

  /**
   * Perform a full project scan and update tracking
   */
  async performFullScan(): Promise<void> {
    if (!this.isInitialized || !this.currentProject) {
      console.warn('[CODE-ORCHESTRATOR] Service not initialized');
      return;
    }
    
    console.log('[CODE-ORCHESTRATOR] Starting full project scan');
    
    // Scan all files and update tracking
    await fileTrackingService.scanProject();
    
    // Re-vectorize changed files
    await this.vectorizeExternallyChangedFiles();
    
    // TODO scan should be triggered from renderer
    console.log('[CODE-ORCHESTRATOR] TODO scan should be triggered from renderer');
    
    console.log('[CODE-ORCHESTRATOR] Full project scan completed');
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    currentProject: string | null;
    services: {
      fileTracking: boolean;
      codeVectorization: boolean;
    };
  } {
    return {
      initialized: this.isInitialized,
      currentProject: this.currentProject,
      services: {
        fileTracking: this.isInitialized,
        codeVectorization: this.codeVectorization.isReady()
      }
    };
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    console.log('[CODE-ORCHESTRATOR] Shutting down services');
    
    try {
      // TODO scanner should be stopped from renderer
      
      // Shutdown file tracking
      await fileTrackingService.shutdown();
      
      // Code vectorization doesn't have a shutdown method, but we can reset state
      this.isInitialized = false;
      this.currentProject = null;
      
      console.log('[CODE-ORCHESTRATOR] All services shut down');
    } catch (error) {
      console.error('[CODE-ORCHESTRATOR] Error during shutdown:', error);
    }
  }
}

export const codeOrchestratorService = CodeOrchestratorService.getInstance();