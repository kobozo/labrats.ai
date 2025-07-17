import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectPathService } from '../../../services/project-path-service';

export async function executeFileSearchTool(args: any): Promise<string> {
  try {
    console.log('[FILE-SEARCH-TOOL-MAIN] Executing file search with query:', args.query);
    
    // Get project path
    const projectPathService = getProjectPathService();
    const projectPath = projectPathService.getProjectPath();
    
    if (!projectPath) {
      return JSON.stringify({
        success: false,
        error: 'No project is currently open. Please open a project first.'
      });
    }

    const { query, limit = 50, includePatterns, excludePatterns } = args;

    if (!query || typeof query !== 'string') {
      return JSON.stringify({
        success: false,
        error: 'Query parameter is required and must be a string'
      });
    }

    // Get all files in the project
    const allFiles = await findAllFiles(projectPath);
    
    // Filter files based on query
    const matchingFiles = allFiles.filter(file => {
      const fileName = path.basename(file);
      const relativePath = path.relative(projectPath, file);
      
      // Check if file matches query (case-insensitive)
      const matchesQuery = fileName.toLowerCase().includes(query.toLowerCase()) ||
                          relativePath.toLowerCase().includes(query.toLowerCase());
      
      if (!matchesQuery) return false;
      
      // Apply include patterns if specified
      if (includePatterns) {
        const patterns = includePatterns.split(',').map((p: string) => p.trim()).filter((p: string) => p);
        const matchesInclude = patterns.some((pattern: string) => 
          relativePath.includes(pattern) || fileName.includes(pattern)
        );
        if (!matchesInclude) return false;
      }
      
      // Apply exclude patterns if specified
      if (excludePatterns) {
        const patterns = excludePatterns.split(',').map((p: string) => p.trim()).filter((p: string) => p);
        const matchesExclude = patterns.some((pattern: string) => 
          relativePath.includes(pattern) || fileName.includes(pattern)
        );
        if (matchesExclude) return false;
      }
      
      return true;
    });

    // Limit results and format them
    const limitedResults = matchingFiles.slice(0, limit);
    const formattedResults = await Promise.all(
      limitedResults.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const relativePath = path.relative(projectPath, filePath);
          
          return {
            name: path.basename(filePath),
            path: relativePath,
            fullPath: filePath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.isFile() ? `${(stats.size / 1024).toFixed(2)} KB` : null,
            lastModified: stats.mtime.toISOString(),
            extension: path.extname(filePath).slice(1) || 'none'
          };
        } catch (error) {
          console.warn('[FILE-SEARCH-TOOL-MAIN] Error getting stats for file:', filePath, error);
          return {
            name: path.basename(filePath),
            path: path.relative(projectPath, filePath),
            fullPath: filePath,
            type: 'file',
            size: 'Unknown',
            lastModified: new Date().toISOString(),
            extension: path.extname(filePath).slice(1) || 'none'
          };
        }
      })
    );

    return JSON.stringify({
      success: true,
      query,
      totalResults: formattedResults.length,
      totalMatched: matchingFiles.length,
      results: formattedResults
    });
  } catch (error) {
    console.error('[FILE-SEARCH-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

async function findAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walkDirectory(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip common ignore patterns
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === '.git') {
          continue;
        }
        
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await walkDirectory(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn('[FILE-SEARCH-TOOL-MAIN] Skipping directory:', currentPath, error);
    }
  }
  
  await walkDirectory(dirPath);
  return files;
}