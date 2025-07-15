import * as path from 'path';
import * as fs from 'fs/promises';

export class PathValidator {
  private projectRoot: string;
  private resolvedRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.resolvedRoot = path.resolve(projectRoot);
  }

  /**
   * Validates and resolves a path, ensuring it's within the project bounds
   */
  async validatePath(requestedPath: string): Promise<string> {
    // Default to root if no path provided
    if (!requestedPath || requestedPath === '.') {
      return this.resolvedRoot;
    }

    // Resolve the absolute path
    const resolvedPath = path.resolve(this.projectRoot, requestedPath);

    // Check if path is within project bounds
    if (!resolvedPath.startsWith(this.resolvedRoot)) {
      throw new Error(`Path traversal detected: ${requestedPath}`);
    }

    // Check if path exists
    try {
      await fs.access(resolvedPath);
    } catch (error) {
      throw new Error(`Path does not exist: ${requestedPath}`);
    }

    return resolvedPath;
  }

  /**
   * Gets the relative path from project root
   */
  getRelativePath(absolutePath: string): string {
    return path.relative(this.resolvedRoot, absolutePath);
  }

  /**
   * Checks if a file should be ignored based on common patterns
   */
  shouldIgnore(filePath: string): boolean {
    const basename = path.basename(filePath);
    
    // Common ignore patterns
    const ignorePatterns = [
      /^\.git$/,
      /^node_modules$/,
      /^\.DS_Store$/,
      /^Thumbs\.db$/,
      /^\.idea$/,
      /^\.vscode$/,
      /^dist$/,
      /^build$/,
      /^out$/,
      /^\.next$/,
      /^coverage$/,
      /^\.nyc_output$/,
      /^\.cache$/,
      /^\.labrats\/cache$/,
      /^\.env.*$/,
      /^.*\.log$/
    ];

    return ignorePatterns.some(pattern => pattern.test(basename));
  }

  /**
   * Validates if a path is safe to read
   */
  async canRead(requestedPath: string): Promise<boolean> {
    try {
      const validPath = await this.validatePath(requestedPath);
      const stats = await fs.stat(validPath);
      
      // Additional checks can be added here
      // For example: check file size limits, file types, etc.
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the project root
   */
  getProjectRoot(): string {
    return this.resolvedRoot;
  }
}