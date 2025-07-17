import * as fs from 'fs';
import * as path from 'path';

export interface ReadmeContext {
  filePath: string;
  content: string;
  summary: string;
  coversFolders: string[];
  depth: number;
}

export class ReadmeContextService {
  private static instance: ReadmeContextService;
  private contextCache: Map<string, ReadmeContext> = new Map();
  private projectPath: string | null = null;

  private constructor() {}

  static getInstance(): ReadmeContextService {
    if (!ReadmeContextService.instance) {
      ReadmeContextService.instance = new ReadmeContextService();
    }
    return ReadmeContextService.instance;
  }

  /**
   * Initialize the service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    this.contextCache.clear();
    await this.buildContextHierarchy();
  }

  /**
   * Get README context for a specific file path
   */
  async getContextForFile(filePath: string): Promise<ReadmeContext[]> {
    if (!this.projectPath) {
      throw new Error('ReadmeContextService not initialized');
    }

    const contexts: ReadmeContext[] = [];
    const relativePath = path.relative(this.projectPath, filePath);
    const pathParts = relativePath.split(path.sep);
    
    // Build path hierarchy from root to file
    let currentPath = this.projectPath;
    
    for (let i = 0; i < pathParts.length; i++) {
      const readme = await this.findReadmeInPath(currentPath);
      if (readme) {
        contexts.push(readme);
      }
      
      // Move to next level if not at file level
      if (i < pathParts.length - 1) {
        currentPath = path.join(currentPath, pathParts[i]);
      }
    }

    return contexts;
  }

  /**
   * Find README file in a specific path
   */
  private async findReadmeInPath(dirPath: string): Promise<ReadmeContext | null> {
    if (this.contextCache.has(dirPath)) {
      return this.contextCache.get(dirPath)!;
    }

    const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'readme.txt'];
    
    for (const readmeName of readmeNames) {
      const readmePath = path.join(dirPath, readmeName);
      if (fs.existsSync(readmePath)) {
        try {
          const content = await fs.promises.readFile(readmePath, 'utf-8');
          const context = await this.parseReadme(readmePath, content);
          this.contextCache.set(dirPath, context);
          return context;
        } catch (error) {
          console.error(`[README-CONTEXT] Failed to read ${readmePath}:`, error);
        }
      }
    }

    return null;
  }

  /**
   * Parse README content and extract context
   */
  private async parseReadme(filePath: string, content: string): Promise<ReadmeContext> {
    const relativePath = this.projectPath ? path.relative(this.projectPath, filePath) : filePath;
    const depth = relativePath.split(path.sep).length - 1;
    
    // Extract summary from README
    const summary = this.extractSummary(content);
    
    // Find folders mentioned in README
    const folderPath = path.dirname(filePath);
    const coversFolders = await this.findCoveredFolders(folderPath, content);

    return {
      filePath,
      content,
      summary,
      coversFolders,
      depth
    };
  }

  /**
   * Extract a summary from README content
   */
  private extractSummary(content: string): string {
    const lines = content.split('\n');
    let summary = '';
    let inCodeBlock = false;
    let foundFirstHeader = false;
    
    for (const line of lines) {
      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      
      // Skip content inside code blocks
      if (inCodeBlock) continue;
      
      // Find first header (project/folder name)
      if (line.startsWith('#') && !foundFirstHeader) {
        foundFirstHeader = true;
        continue;
      }
      
      // Collect description until next header or end
      if (foundFirstHeader) {
        if (line.startsWith('#') && summary.length > 0) {
          break; // Stop at next header
        }
        
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          summary += trimmed + ' ';
        }
        
        // Stop after a reasonable amount of text
        if (summary.length > 500) {
          break;
        }
      }
    }
    
    return summary.trim() || 'No description available';
  }

  /**
   * Find folders that this README covers
   */
  private async findCoveredFolders(folderPath: string, content: string): Promise<string[]> {
    const folders: string[] = [];
    
    try {
      const items = await fs.promises.readdir(folderPath, { withFileTypes: true });
      const subFolders = items.filter(item => item.isDirectory()).map(item => item.name);
      
      // Check if any subfolder names are mentioned in README
      const contentLower = content.toLowerCase();
      
      for (const folder of subFolders) {
        // Skip common non-important folders
        if (folder.startsWith('.') || folder === 'node_modules' || folder === 'dist' || folder === 'build') {
          continue;
        }
        
        // Check if folder is mentioned in README
        if (contentLower.includes(folder.toLowerCase()) || 
            contentLower.includes(`/${folder}/`) ||
            contentLower.includes(`\`${folder}\``)) {
          folders.push(folder);
        }
      }
      
      // If no specific folders mentioned, assume it covers all subfolders
      if (folders.length === 0) {
        folders.push(...subFolders.filter(f => !f.startsWith('.') && 
                                             f !== 'node_modules' && 
                                             f !== 'dist' && 
                                             f !== 'build'));
      }
      
    } catch (error) {
      console.error(`[README-CONTEXT] Failed to read folder ${folderPath}:`, error);
    }
    
    return folders;
  }

  /**
   * Build the complete context hierarchy
   */
  private async buildContextHierarchy(): Promise<void> {
    if (!this.projectPath) return;
    
    const readmeFiles = await this.findAllReadmeFiles(this.projectPath);
    
    for (const readmePath of readmeFiles) {
      const folderPath = path.dirname(readmePath);
      await this.findReadmeInPath(folderPath);
    }
  }

  /**
   * Find all README files in the project
   */
  private async findAllReadmeFiles(rootPath: string): Promise<string[]> {
    const readmeFiles: string[] = [];
    
    const walk = async (currentPath: string) => {
      try {
        const items = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item.name);
          
          if (item.isDirectory()) {
            // Skip common ignored directories
            if (item.name.startsWith('.') || 
                item.name === 'node_modules' || 
                item.name === 'dist' || 
                item.name === 'build') {
              continue;
            }
            await walk(itemPath);
          } else if (item.isFile()) {
            const fileName = item.name.toLowerCase();
            if (fileName.startsWith('readme.') && 
                (fileName.endsWith('.md') || fileName.endsWith('.txt'))) {
              readmeFiles.push(itemPath);
            }
          }
        }
      } catch (error) {
        console.error(`[README-CONTEXT] Failed to walk directory ${currentPath}:`, error);
      }
    };
    
    await walk(rootPath);
    return readmeFiles;
  }

  /**
   * Get all README contexts in the project
   */
  getAllContexts(): ReadmeContext[] {
    return Array.from(this.contextCache.values());
  }

  /**
   * Create a contextual description for a file path
   */
  async createContextualDescription(filePath: string): Promise<string> {
    const contexts = await this.getContextForFile(filePath);
    
    if (contexts.length === 0) {
      return '';
    }

    const descriptions = contexts.map(ctx => {
      const folderName = path.basename(path.dirname(ctx.filePath));
      return `${folderName === '.' ? 'Project' : folderName}: ${ctx.summary}`;
    });

    return descriptions.join(' → ');
  }
}