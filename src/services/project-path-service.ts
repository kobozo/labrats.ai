import * as path from 'path';
import * as fs from 'fs';

/**
 * Central service for managing project paths and .labrats directory structure
 */
export class ProjectPathService {
  private static instance: ProjectPathService;
  private currentProjectPath: string | null = null;

  private constructor() {}

  static getInstance(): ProjectPathService {
    if (!ProjectPathService.instance) {
      ProjectPathService.instance = new ProjectPathService();
    }
    return ProjectPathService.instance;
  }

  /**
   * Set the current project path
   */
  setProjectPath(projectPath: string | null): void {
    this.currentProjectPath = projectPath;
  }

  /**
   * Get the current project path
   */
  getProjectPath(): string | null {
    return this.currentProjectPath;
  }

  /**
   * Get the .labrats directory path for the current project
   */
  getLabRatsPath(): string {
    if (!this.currentProjectPath) {
      throw new Error('No project path set');
    }
    return path.join(this.currentProjectPath, '.labrats');
  }

  /**
   * Get a specific subdirectory within .labrats
   */
  getLabRatsSubPath(...subdirs: string[]): string {
    return path.join(this.getLabRatsPath(), ...subdirs);
  }

  /**
   * Ensure a directory exists within .labrats
   */
  ensureLabRatsDirectory(...subdirs: string[]): void {
    const dirPath = this.getLabRatsSubPath(...subdirs);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get the vector storage path
   */
  getVectorStoragePath(): string {
    this.ensureLabRatsDirectory('vectors');
    return this.getLabRatsSubPath('vectors');
  }

  /**
   * Get the boards storage path
   */
  getBoardsPath(): string {
    this.ensureLabRatsDirectory('boards');
    return this.getLabRatsSubPath('boards');
  }

  /**
   * Get the chat history path
   */
  getChatHistoryPath(): string {
    this.ensureLabRatsDirectory('chats');
    return this.getLabRatsSubPath('chats');
  }

  /**
   * Check if we're in a valid project with .labrats directory
   */
  isValidProject(): boolean {
    if (!this.currentProjectPath) {
      return false;
    }
    return fs.existsSync(this.getLabRatsPath());
  }

  /**
   * Initialize .labrats directory structure
   */
  initializeLabRatsDirectory(): void {
    if (!this.currentProjectPath) {
      throw new Error('No project path set');
    }

    // Create main .labrats directory and subdirectories
    this.ensureLabRatsDirectory();
    this.ensureLabRatsDirectory('boards');
    this.ensureLabRatsDirectory('boards', 'tasks');
    this.ensureLabRatsDirectory('chats');
    this.ensureLabRatsDirectory('vectors');
    this.ensureLabRatsDirectory('vectors', 'indices');
    this.ensureLabRatsDirectory('vectors', 'embeddings');
  }
}

// Export singleton instance getter
export function getProjectPathService(): ProjectPathService {
  return ProjectPathService.getInstance();
}