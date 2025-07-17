import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectPathService } from '../../../services/project-path-service';

export async function executeReplaceTextTool(args: any): Promise<string> {
  try {
    console.log('[REPLACE-TEXT-TOOL-MAIN] Executing replace text with args:', args);
    
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
      filePath, 
      searchText, 
      replaceText = '', 
      caseSensitive = false, 
      useRegex = false,
      replaceAll = true
    } = args;

    if (!filePath || typeof filePath !== 'string') {
      return JSON.stringify({
        success: false,
        error: 'filePath parameter is required and must be a string'
      });
    }

    if (!searchText || typeof searchText !== 'string') {
      return JSON.stringify({
        success: false,
        error: 'searchText parameter is required and must be a string'
      });
    }

    // Validate and resolve file path
    const absolutePath = path.resolve(projectPath, filePath);
    if (!absolutePath.startsWith(projectPath)) {
      return JSON.stringify({
        success: false,
        error: 'Path traversal attempt detected'
      });
    }

    try {
      // Read the file
      const content = await fs.readFile(absolutePath, 'utf-8');
      let newContent = content;
      let replacementCount = 0;

      if (useRegex) {
        // Use regex replacement
        try {
          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(searchText, flags);
          
          if (replaceAll) {
            newContent = content.replace(regex, replaceText);
            // Count replacements by comparing with original
            const matches = content.match(regex);
            replacementCount = matches ? matches.length : 0;
          } else {
            // Replace only first occurrence
            newContent = content.replace(regex, replaceText);
            replacementCount = newContent !== content ? 1 : 0;
          }
        } catch (regexError) {
          return JSON.stringify({
            success: false,
            error: `Invalid regex pattern: ${regexError instanceof Error ? regexError.message : 'Unknown regex error'}`
          });
        }
      } else {
        // Use literal string replacement
        const searchPattern = caseSensitive ? searchText : searchText.toLowerCase();
        const contentToSearch = caseSensitive ? content : content.toLowerCase();
        
        if (replaceAll) {
          // Replace all occurrences
          const regex = new RegExp(
            searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
            caseSensitive ? 'g' : 'gi'
          );
          newContent = content.replace(regex, replaceText);
          
          // Count replacements
          const matches = contentToSearch.split(searchPattern).length - 1;
          replacementCount = matches;
        } else {
          // Replace only first occurrence
          const index = contentToSearch.indexOf(searchPattern);
          if (index !== -1) {
            // Find the actual position in the original content
            let actualIndex = index;
            if (!caseSensitive) {
              // Need to find the exact position in the original case
              const beforeMatch = content.substring(0, index);
              actualIndex = beforeMatch.length;
            }
            
            newContent = content.substring(0, actualIndex) + 
                        replaceText + 
                        content.substring(actualIndex + searchText.length);
            replacementCount = 1;
          }
        }
      }

      // Write the updated content back to the file
      if (replacementCount > 0) {
        await fs.writeFile(absolutePath, newContent, 'utf-8');
      }

      return JSON.stringify({
        success: true,
        filePath,
        searchText,
        replaceText,
        replacementCount,
        caseSensitive,
        useRegex,
        replaceAll,
        fileSize: newContent.length,
        modified: replacementCount > 0
      });
    } catch (fileError) {
      return JSON.stringify({
        success: false,
        error: `File operation failed: ${fileError instanceof Error ? fileError.message : 'Unknown file error'}`
      });
    }
  } catch (error) {
    console.error('[REPLACE-TEXT-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}