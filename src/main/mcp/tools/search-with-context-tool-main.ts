import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectPathService } from '../../../services/project-path-service';
import { CodeParserService } from '../../code-parser-service';

interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
  matchText: string;
  codeElement?: {
    type: string;
    name: string;
    startLine: number;
    endLine: number;
  };
}

interface FileSearchResult {
  file: {
    name: string;
    path: string;
    fullPath: string;
    type: string;
  };
  matches: SearchMatch[];
}

export async function executeSearchWithContextTool(args: any): Promise<string> {
  try {
    console.log('[SEARCH-WITH-CONTEXT-TOOL-MAIN] Executing search with context:', args.query);
    
    // Get project path
    const projectPathService = getProjectPathService();
    const projectPath = projectPathService.getProjectPath();
    
    if (!projectPath) {
      return JSON.stringify({
        success: false,
        error: 'No project is currently open. Please open a project first.'
      });
    }

    const { 
      query, 
      caseSensitive = false, 
      useRegex = false, 
      limit = 50,
      maxMatchesPerFile = 5,
      includeCodeContext = true,
      includePatterns, 
      excludePatterns 
    } = args;

    if (!query || typeof query !== 'string') {
      return JSON.stringify({
        success: false,
        error: 'Query parameter is required and must be a string'
      });
    }

    // Get all text files in the project
    const allFiles = await findTextFiles(projectPath);
    
    // Apply include/exclude patterns
    let filteredFiles = allFiles;
    if (includePatterns) {
      const patterns = includePatterns.split(',').map((p: string) => p.trim()).filter((p: string) => p);
      filteredFiles = filteredFiles.filter(file => 
        patterns.some((pattern: string) => file.includes(pattern) || path.basename(file).includes(pattern))
      );
    }
    
    if (excludePatterns) {
      const patterns = excludePatterns.split(',').map((p: string) => p.trim()).filter((p: string) => p);
      filteredFiles = filteredFiles.filter(file => 
        !patterns.some((pattern: string) => file.includes(pattern) || path.basename(file).includes(pattern))
      );
    }

    // Limit files for performance
    const filesToSearch = filteredFiles.slice(0, limit);
    
    // Get code parser service
    const parserService = CodeParserService.getInstance();
    
    // Search within files
    const searchResults: FileSearchResult[] = [];
    const searchPattern = useRegex 
      ? new RegExp(query, caseSensitive ? 'g' : 'gi')
      : null;

    for (const filePath of filesToSearch) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const matches: SearchMatch[] = [];

        // Parse the file if code context is requested
        let codeElements: any[] = [];
        if (includeCodeContext) {
          try {
            codeElements = await parserService.parseFile(filePath);
          } catch (parseError) {
            console.warn('[SEARCH-WITH-CONTEXT-TOOL-MAIN] Could not parse file:', filePath, parseError);
          }
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let foundMatches: SearchMatch[] = [];

          if (useRegex && searchPattern) {
            const regexMatches = [...line.matchAll(searchPattern)];
            foundMatches = regexMatches.map(match => ({
              lineNumber: i + 1,
              lineContent: line,
              matchStart: match.index!,
              matchEnd: match.index! + match[0].length,
              matchText: match[0]
            }));
          } else {
            const searchText = caseSensitive ? query : query.toLowerCase();
            const lineText = caseSensitive ? line : line.toLowerCase();
            let index = lineText.indexOf(searchText);

            while (index !== -1) {
              foundMatches.push({
                lineNumber: i + 1,
                lineContent: line,
                matchStart: index,
                matchEnd: index + query.length,
                matchText: line.substring(index, index + query.length)
              });
              index = lineText.indexOf(searchText, index + 1);
            }
          }

          // Add code element context to matches
          if (includeCodeContext && codeElements.length > 0) {
            foundMatches = foundMatches.map(match => {
              const containingElement = codeElements.find(element => 
                element.startLine <= match.lineNumber && element.endLine >= match.lineNumber
              );
              
              if (containingElement) {
                match.codeElement = {
                  type: containingElement.type,
                  name: containingElement.name,
                  startLine: containingElement.startLine,
                  endLine: containingElement.endLine
                };
              }
              
              return match;
            });
          }

          matches.push(...foundMatches);
          
          // Limit matches per file for performance
          if (matches.length >= maxMatchesPerFile) {
            break;
          }
        }

        if (matches.length > 0) {
          const relativePath = path.relative(projectPath, filePath);
          searchResults.push({
            file: {
              name: path.basename(filePath),
              path: relativePath,
              fullPath: filePath,
              type: 'file'
            },
            matches: matches.slice(0, maxMatchesPerFile)
          });
        }
      } catch (error) {
        // Skip files that can't be read
        console.warn('[SEARCH-WITH-CONTEXT-TOOL-MAIN] Could not read file:', filePath, error);
      }
    }

    // Calculate statistics
    const totalMatches = searchResults.reduce((sum, result) => sum + result.matches.length, 0);
    const codeElementTypes: { [key: string]: number } = {};
    
    searchResults.forEach(result => {
      result.matches.forEach(match => {
        if (match.codeElement) {
          codeElementTypes[match.codeElement.type] = (codeElementTypes[match.codeElement.type] || 0) + 1;
        }
      });
    });

    return JSON.stringify({
      success: true,
      query,
      caseSensitive,
      useRegex,
      includeCodeContext,
      totalFiles: searchResults.length,
      totalMatches,
      filesSearched: filesToSearch.length,
      codeElementTypes,
      results: searchResults
    });
  } catch (error) {
    console.error('[SEARCH-WITH-CONTEXT-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

async function findTextFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  // Common text file extensions
  const textExtensions = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', 
    '.cs', '.rs', '.swift', '.kt', '.cpp', '.c', '.h', '.hpp', '.css',
    '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.json', '.yaml',
    '.yml', '.toml', '.ini', '.cfg', '.conf', '.txt', '.md', '.markdown',
    '.rst', '.tex', '.log', '.sql', '.sh', '.bash', '.zsh', '.fish',
    '.dockerfile', '.makefile', '.gradle', '.cmake', '.vue', '.svelte'
  ]);
  
  async function walkDirectory(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip common ignore patterns
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === '.git' ||
            entry.name.match(/\.(jpg|jpeg|png|gif|bmp|svg|ico|pdf|zip|tar|gz|exe|dll|so|dylib|bin)$/i)) {
          continue;
        }
        
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await walkDirectory(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (textExtensions.has(ext) || !ext) {
            // Include files with no extension (like Makefile, Dockerfile)
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn('[SEARCH-WITH-CONTEXT-TOOL-MAIN] Skipping directory:', currentPath, error);
    }
  }
  
  await walkDirectory(dirPath);
  return files;
}