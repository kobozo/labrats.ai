import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectPathService } from '../../../services/project-path-service';
import { CodeParserService } from '../../code-parser-service';

export async function executeReadCodeElementTool(args: any): Promise<string> {
  try {
    console.log('[READ-CODE-ELEMENT-TOOL-MAIN] Executing with args:', args);
    
    // Get project path
    const projectPathService = getProjectPathService();
    const projectPath = projectPathService.getProjectPath();
    
    if (!projectPath) {
      return JSON.stringify({
        success: false,
        error: 'No project is currently open. Please open a project first.'
      });
    }

    const { filePath, lineNumber, searchQuery, contextLines = 5 } = args;

    if (!filePath || typeof filePath !== 'string') {
      return JSON.stringify({
        success: false,
        error: 'filePath parameter is required and must be a string'
      });
    }

    if (!lineNumber || typeof lineNumber !== 'number') {
      return JSON.stringify({
        success: false,
        error: 'lineNumber parameter is required and must be a number'
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
      // Get the code parser service
      const parserService = CodeParserService.getInstance();
      
      // Parse the file to get code elements
      const codeElements = await parserService.parseFile(absolutePath);
      
      // Find the code element that contains the given line number
      const containingElement = codeElements.find(element => 
        element.startLine <= lineNumber && element.endLine >= lineNumber
      );

      if (!containingElement) {
        // If no code element found, fall back to reading context lines
        console.log('[READ-CODE-ELEMENT-TOOL-MAIN] No code element found, reading context lines');
        const content = await fs.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n');
        
        const startLine = Math.max(0, lineNumber - contextLines - 1);
        const endLine = Math.min(lines.length, lineNumber + contextLines);
        
        const contextContent = lines.slice(startLine, endLine).join('\n');
        
        return JSON.stringify({
          success: true,
          filePath,
          lineNumber,
          searchQuery,
          element: null,
          context: {
            content: contextContent,
            startLine: startLine + 1,
            endLine: endLine,
            lines: endLine - startLine
          }
        });
      }

      // Get related elements if it's a method in a class
      let relatedElements = [];
      if (containingElement.type === 'method') {
        // Find the parent class
        const parentClass = codeElements.find(element => 
          element.type === 'class' && 
          element.startLine < containingElement.startLine && 
          element.endLine > containingElement.endLine
        );
        
        if (parentClass) {
          relatedElements.push({
            type: 'parent',
            element: {
              type: parentClass.type,
              name: parentClass.name,
              startLine: parentClass.startLine,
              endLine: parentClass.endLine
            }
          });
        }
      }

      // Get imports that might be relevant
      const imports = codeElements.filter(element => 
        element.type === 'import' && 
        element.startLine < containingElement.startLine
      ).map(imp => ({
        type: 'import',
        content: imp.content,
        line: imp.startLine
      }));

      // If searchQuery is provided, highlight its occurrences
      let highlightPositions: Array<{ line: number; start: number; end: number }> = [];
      if (searchQuery) {
        const elementLines = containingElement.content.split('\n');
        elementLines.forEach((line, index) => {
          let pos = line.indexOf(searchQuery);
          while (pos !== -1) {
            highlightPositions.push({
              line: containingElement.startLine + index,
              start: pos,
              end: pos + searchQuery.length
            });
            pos = line.indexOf(searchQuery, pos + 1);
          }
        });
      }

      return JSON.stringify({
        success: true,
        filePath,
        lineNumber,
        searchQuery,
        element: {
          type: containingElement.type,
          name: containingElement.name,
          content: containingElement.content,
          startLine: containingElement.startLine,
          endLine: containingElement.endLine,
          language: containingElement.language,
          parameters: containingElement.parameters,
          returnType: containingElement.returnType,
          modifiers: containingElement.modifiers,
          jsdoc: containingElement.jsdoc,
          complexity: containingElement.complexity
        },
        relatedElements,
        imports: imports.slice(0, 10), // Limit imports for readability
        highlightPositions,
        totalLines: containingElement.endLine - containingElement.startLine + 1
      });
    } catch (error) {
      console.error('[READ-CODE-ELEMENT-TOOL-MAIN] Error reading file:', error);
      return JSON.stringify({
        success: false,
        error: `Failed to read code element: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  } catch (error) {
    console.error('[READ-CODE-ELEMENT-TOOL-MAIN] Error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}