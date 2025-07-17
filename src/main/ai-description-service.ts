import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ElementDescription {
  elementId: string;
  type: string;
  name: string;
  description: string;
  lineStart: number;
  lineEnd: number;
  lastUpdated: string;
}

export interface FileDescriptions {
  filePath: string;
  fileHash: string;
  language: string;
  lastUpdated: string;
  elements: ElementDescription[];
}

export interface DescriptionIndex {
  version: string;
  projectPath: string;
  files: { [filePath: string]: FileDescriptions };
  lastUpdated: string;
}

/**
 * Service to manage AI-generated descriptions for code elements
 */
export class AIDescriptionService {
  private static instance: AIDescriptionService;
  private projectPath: string | null = null;
  private descriptionIndex: Map<string, FileDescriptions> = new Map();
  private isInitialized: boolean = false;

  private constructor() {}

  static getInstance(): AIDescriptionService {
    if (!AIDescriptionService.instance) {
      AIDescriptionService.instance = new AIDescriptionService();
    }
    return AIDescriptionService.instance;
  }

  /**
   * Initialize the service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    console.log('[AI-DESCRIPTION] Initializing for project:', projectPath);
    this.projectPath = projectPath;
    
    // Ensure directories exist
    await this.ensureDirectories();
    
    // Load existing descriptions
    await this.loadDescriptionIndex();
    
    this.isInitialized = true;
    console.log('[AI-DESCRIPTION] Initialized with', this.descriptionIndex.size, 'files');
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    if (!this.projectPath) return;
    
    const descriptionsPath = path.join(this.projectPath, '.labrats', 'descriptions');
    if (!fs.existsSync(descriptionsPath)) {
      await fs.promises.mkdir(descriptionsPath, { recursive: true });
    }
  }

  /**
   * Get path to the description index file
   */
  private getIndexPath(): string {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }
    return path.join(this.projectPath, '.labrats', 'descriptions', 'index.json');
  }

  /**
   * Get path to a specific file's descriptions
   */
  private getFileDescriptionPath(filePath: string): string {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }
    
    // Create a safe filename from the file path
    const relativePath = path.relative(this.projectPath, filePath);
    const safeFileName = crypto.createHash('md5').update(relativePath).digest('hex');
    
    return path.join(this.projectPath, '.labrats', 'descriptions', `${safeFileName}.json`);
  }

  /**
   * Load description index from disk
   */
  private async loadDescriptionIndex(): Promise<void> {
    try {
      const indexPath = this.getIndexPath();
      if (fs.existsSync(indexPath)) {
        const content = await fs.promises.readFile(indexPath, 'utf-8');
        const index = JSON.parse(content) as DescriptionIndex;
        
        // Convert to Map
        this.descriptionIndex.clear();
        for (const [filePath, descriptions] of Object.entries(index.files)) {
          this.descriptionIndex.set(filePath, descriptions);
        }
        
        console.log('[AI-DESCRIPTION] Loaded descriptions for', this.descriptionIndex.size, 'files');
      }
    } catch (error) {
      console.error('[AI-DESCRIPTION] Failed to load description index:', error);
    }
  }

  /**
   * Save description index to disk
   */
  private async saveDescriptionIndex(): Promise<void> {
    if (!this.projectPath) return;
    
    try {
      const indexPath = this.getIndexPath();
      
      // Convert Map to object
      const files: { [filePath: string]: FileDescriptions } = {};
      for (const [filePath, descriptions] of this.descriptionIndex) {
        files[filePath] = descriptions;
      }
      
      const index: DescriptionIndex = {
        version: '1.0',
        projectPath: this.projectPath,
        files,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      
      // Also save individual file descriptions
      for (const [filePath, descriptions] of this.descriptionIndex) {
        const descPath = this.getFileDescriptionPath(filePath);
        await fs.promises.writeFile(descPath, JSON.stringify(descriptions, null, 2), 'utf-8');
      }
    } catch (error) {
      console.error('[AI-DESCRIPTION] Failed to save description index:', error);
    }
  }

  /**
   * Add or update description for a code element
   */
  async addElementDescription(
    filePath: string,
    elementId: string,
    elementInfo: {
      type: string;
      name: string;
      description: string;
      lineStart: number;
      lineEnd: number;
    },
    fileHash: string,
    language: string
  ): Promise<void> {
    // Get or create file descriptions
    let fileDesc = this.descriptionIndex.get(filePath);
    if (!fileDesc) {
      fileDesc = {
        filePath,
        fileHash,
        language,
        lastUpdated: new Date().toISOString(),
        elements: []
      };
      this.descriptionIndex.set(filePath, fileDesc);
    }
    
    // Update file info
    fileDesc.fileHash = fileHash;
    fileDesc.language = language;
    fileDesc.lastUpdated = new Date().toISOString();
    
    // Find or create element description
    const existingIndex = fileDesc.elements.findIndex(e => e.elementId === elementId);
    const elementDesc: ElementDescription = {
      elementId,
      type: elementInfo.type,
      name: elementInfo.name,
      description: elementInfo.description,
      lineStart: elementInfo.lineStart,
      lineEnd: elementInfo.lineEnd,
      lastUpdated: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      fileDesc.elements[existingIndex] = elementDesc;
    } else {
      fileDesc.elements.push(elementDesc);
    }
    
    // Sort elements by line number
    fileDesc.elements.sort((a, b) => a.lineStart - b.lineStart);
    
    // Save to disk
    await this.saveDescriptionIndex();
  }

  /**
   * Get descriptions for a file
   */
  async getFileDescriptions(filePath: string): Promise<FileDescriptions | null> {
    // Try to get from memory first
    let descriptions = this.descriptionIndex.get(filePath);
    
    if (!descriptions) {
      // Try to load from individual file
      try {
        const descPath = this.getFileDescriptionPath(filePath);
        if (fs.existsSync(descPath)) {
          const content = await fs.promises.readFile(descPath, 'utf-8');
          descriptions = JSON.parse(content) as FileDescriptions;
          this.descriptionIndex.set(filePath, descriptions);
        }
      } catch (error) {
        console.error('[AI-DESCRIPTION] Failed to load file descriptions:', error);
      }
    }
    
    return descriptions || null;
  }

  /**
   * Get human-readable content for a file
   */
  async getHumanReadableContent(filePath: string): Promise<string | null> {
    const descriptions = await this.getFileDescriptions(filePath);
    if (!descriptions || descriptions.elements.length === 0) {
      return null;
    }
    
    // Build human-readable content
    const lines: string[] = [];
    
    // Add file header
    lines.push(`# ${path.basename(filePath)}`);
    lines.push('');
    lines.push(`**Language:** ${descriptions.language}`);
    lines.push(`**Last Updated:** ${new Date(descriptions.lastUpdated).toLocaleString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    // Add element descriptions
    for (const element of descriptions.elements) {
      // Add element header
      lines.push(`## ${element.type}: ${element.name}`);
      lines.push(`*Lines ${element.lineStart}-${element.lineEnd}*`);
      lines.push('');
      
      // Add description
      lines.push(element.description);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Remove descriptions for a file
   */
  async removeFileDescriptions(filePath: string): Promise<void> {
    this.descriptionIndex.delete(filePath);
    
    // Delete individual file
    try {
      const descPath = this.getFileDescriptionPath(filePath);
      if (fs.existsSync(descPath)) {
        await fs.promises.unlink(descPath);
      }
    } catch (error) {
      console.error('[AI-DESCRIPTION] Failed to delete file descriptions:', error);
    }
    
    // Update index
    await this.saveDescriptionIndex();
  }

  /**
   * Check if a file has descriptions
   */
  hasDescriptions(filePath: string): boolean {
    return this.descriptionIndex.has(filePath);
  }

  /**
   * Get all files with descriptions
   */
  getFilesWithDescriptions(): string[] {
    return Array.from(this.descriptionIndex.keys());
  }

  /**
   * Clear all descriptions
   */
  async clearAllDescriptions(): Promise<void> {
    this.descriptionIndex.clear();
    
    // Delete all description files
    if (this.projectPath) {
      const descriptionsPath = path.join(this.projectPath, '.labrats', 'descriptions');
      if (fs.existsSync(descriptionsPath)) {
        const files = await fs.promises.readdir(descriptionsPath);
        for (const file of files) {
          await fs.promises.unlink(path.join(descriptionsPath, file));
        }
      }
    }
    
    console.log('[AI-DESCRIPTION] Cleared all descriptions');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalFiles: number;
    totalElements: number;
  } {
    let totalElements = 0;
    for (const fileDesc of this.descriptionIndex.values()) {
      totalElements += fileDesc.elements.length;
    }
    
    return {
      totalFiles: this.descriptionIndex.size,
      totalElements
    };
  }
}

export const aiDescriptionService = AIDescriptionService.getInstance();