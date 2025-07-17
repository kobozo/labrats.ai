import { BaseLanguageParser } from './base-parser';
import { ParsedCodeElement } from '../code-parser-service';
import * as fs from 'fs';

interface PythonElement {
  type: 'function' | 'class' | 'method' | 'import';
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
  docstring?: string;
  decorators?: string[];
  parameters?: Array<{ name: string; type?: string; default?: string }>;
  returnType?: string;
  isAsync?: boolean;
  parentClass?: string;
}

export class PythonParser extends BaseLanguageParser {
  constructor() {
    super('python');
  }

  getSupportedExtensions(): string[] {
    return ['.py', '.pyw'];
  }

  async parseFile(filePath: string, content: string): Promise<ParsedCodeElement[]> {
    const elements: ParsedCodeElement[] = [];
    const pythonElements = this.extractPythonElements(content);
    
    // Extract imports
    const imports = pythonElements
      .filter(el => el.type === 'import')
      .map(el => el.name);
    
    // Add file-level element
    elements.push(this.createFileElement(filePath, content, imports));
    
    // Convert Python elements to ParsedCodeElements
    for (const pyElement of pythonElements) {
      if (pyElement.type === 'import') continue; // Already handled at file level
      
      const lineNumbers = this.getLineNumbers(content, pyElement.content, pyElement.startIndex);
      
      const element: ParsedCodeElement = {
        type: pyElement.type,
        name: pyElement.parentClass ? `${pyElement.parentClass}.${pyElement.name}` : pyElement.name,
        content: pyElement.content,
        startLine: lineNumbers.startLine,
        endLine: lineNumbers.endLine,
        filePath,
        language: this.language,
        parameters: pyElement.parameters,
        returnType: pyElement.returnType,
        jsdoc: pyElement.docstring,
        complexity: this.calculateComplexity(pyElement.content),
        modifiers: this.extractModifiers(pyElement),
      };
      
      elements.push(element);
    }
    
    return elements;
  }

  private extractPythonElements(content: string): PythonElement[] {
    const elements: PythonElement[] = [];
    
    // Extract imports
    const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const fromModule = match[1];
      const imports = match[2];
      const importName = fromModule ? `from ${fromModule} import ${imports}` : `import ${imports}`;
      
      elements.push({
        type: 'import',
        name: importName,
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    // Extract classes and their methods
    const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?:\s*$/gm;
    const classMatches = Array.from(content.matchAll(classRegex));
    
    for (const classMatch of classMatches) {
      const className = classMatch[1];
      const classStart = classMatch.index!;
      const classIndent = this.getIndentLevel(content, classStart);
      const classEnd = this.findBlockEnd(content, classStart, classIndent);
      const classContent = content.substring(classStart, classEnd);
      
      // Extract docstring
      const docstring = this.extractDocstring(classContent);
      
      elements.push({
        type: 'class',
        name: className,
        content: classContent,
        startIndex: classStart,
        endIndex: classEnd,
        docstring,
      });
      
      // Extract methods within the class
      const methodRegex = /^(\s*)(?:@.*\n\1)*(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;
      const methodMatches = Array.from(classContent.matchAll(methodRegex));
      
      for (const methodMatch of methodMatches) {
        const methodIndent = methodMatch[1].length;
        if (methodIndent > classIndent) { // Only methods inside the class
          const isAsync = !!methodMatch[2];
          const methodName = methodMatch[3];
          const paramsStr = methodMatch[4];
          const returnType = methodMatch[5]?.trim();
          const methodStart = classStart + methodMatch.index!;
          const methodEnd = this.findBlockEnd(content, methodStart, methodIndent);
          const methodContent = content.substring(methodStart, methodEnd);
          
          // Extract parameters
          const parameters = this.parseParameters(paramsStr);
          
          // Extract decorators
          const decorators = this.extractDecorators(content, methodStart);
          
          // Extract method docstring
          const methodDocstring = this.extractDocstring(methodContent);
          
          elements.push({
            type: 'method',
            name: methodName,
            content: methodContent,
            startIndex: methodStart,
            endIndex: methodEnd,
            docstring: methodDocstring,
            decorators,
            parameters,
            returnType,
            isAsync,
            parentClass: className,
          });
        }
      }
    }
    
    // Extract standalone functions
    const functionRegex = /^(?:@.*\n)*(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/gm;
    const functionMatches = Array.from(content.matchAll(functionRegex));
    
    for (const funcMatch of functionMatches) {
      const funcStart = funcMatch.index!;
      const funcIndent = this.getIndentLevel(content, funcStart);
      
      // Skip if this is inside a class (indent > 0)
      if (funcIndent > 0) continue;
      
      const isAsync = !!funcMatch[1];
      const funcName = funcMatch[2];
      const paramsStr = funcMatch[3];
      const returnType = funcMatch[4]?.trim();
      const funcEnd = this.findBlockEnd(content, funcStart, funcIndent);
      const funcContent = content.substring(funcStart, funcEnd);
      
      // Extract parameters
      const parameters = this.parseParameters(paramsStr);
      
      // Extract decorators
      const decorators = this.extractDecorators(content, funcStart);
      
      // Extract docstring
      const docstring = this.extractDocstring(funcContent);
      
      elements.push({
        type: 'function',
        name: funcName,
        content: funcContent,
        startIndex: funcStart,
        endIndex: funcEnd,
        docstring,
        decorators,
        parameters,
        returnType,
        isAsync,
      });
    }
    
    return elements;
  }

  private getIndentLevel(content: string, position: number): number {
    const lineStart = content.lastIndexOf('\n', position - 1) + 1;
    const line = content.substring(lineStart, position);
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private findBlockEnd(content: string, blockStart: number, blockIndent: number): number {
    const lines = content.substring(blockStart).split('\n');
    let inDocstring = false;
    let docstringDelimiter = '';
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Handle docstrings
      if (!inDocstring && (trimmedLine.startsWith('"""') || trimmedLine.startsWith("'''"))) {
        docstringDelimiter = trimmedLine.substring(0, 3);
        inDocstring = !trimmedLine.endsWith(docstringDelimiter) || trimmedLine.length === 3;
        continue;
      }
      
      if (inDocstring) {
        if (trimmedLine.endsWith(docstringDelimiter)) {
          inDocstring = false;
        }
        continue;
      }
      
      // Skip empty lines and comments
      if (trimmedLine === '' || trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Check indentation
      const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;
      if (lineIndent <= blockIndent && trimmedLine !== '') {
        // Found the end of the block
        const endPosition = blockStart + lines.slice(0, i).join('\n').length;
        return endPosition;
      }
    }
    
    // If we reach here, the block continues to the end of the file
    return content.length;
  }

  private extractDocstring(content: string): string | undefined {
    const docstringRegex = /^[^#\n]*\n\s*("""(.|\n)*?"""|'''(.|\n)*?''')/;
    const match = content.match(docstringRegex);
    
    if (match) {
      const docstring = match[1];
      // Remove quotes and clean up
      return docstring.slice(3, -3).trim();
    }
    
    return undefined;
  }

  private extractDecorators(content: string, position: number): string[] {
    const decorators: string[] = [];
    const lines = content.substring(0, position).split('\n');
    
    // Look backwards from the function/method definition
    for (let i = lines.length - 2; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('@')) {
        decorators.unshift(line);
      } else if (line !== '') {
        break;
      }
    }
    
    return decorators;
  }

  private parseParameters(paramsStr: string): Array<{ name: string; type?: string; default?: string }> {
    if (!paramsStr.trim()) return [];
    
    const params: Array<{ name: string; type?: string; default?: string }> = [];
    const paramParts = this.splitParameters(paramsStr);
    
    for (const param of paramParts) {
      const trimmed = param.trim();
      if (trimmed === 'self' || trimmed === 'cls' || trimmed === '*' || trimmed === '/') {
        continue;
      }
      
      // Handle different parameter formats
      const typeMatch = trimmed.match(/^(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/);
      const defaultMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      const simpleMatch = trimmed.match(/^(\*{0,2}\w+)$/);
      
      if (typeMatch) {
        params.push({
          name: typeMatch[1],
          type: typeMatch[2].trim(),
          default: typeMatch[3]?.trim(),
        });
      } else if (defaultMatch) {
        params.push({
          name: defaultMatch[1],
          default: defaultMatch[2].trim(),
        });
      } else if (simpleMatch) {
        params.push({
          name: simpleMatch[1],
        });
      }
    }
    
    return params;
  }

  private splitParameters(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < paramsStr.length; i++) {
      const char = paramsStr[i];
      
      if (inString) {
        current += char;
        if (char === stringChar && paramsStr[i - 1] !== '\\') {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === '(' || char === '[' || char === '{') {
          depth++;
          current += char;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
          current += char;
        } else if (char === ',' && depth === 0) {
          params.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    
    if (current) {
      params.push(current);
    }
    
    return params;
  }

  private extractModifiers(element: PythonElement): string[] {
    const modifiers: string[] = [];
    
    if (element.isAsync) {
      modifiers.push('async');
    }
    
    if (element.decorators) {
      if (element.decorators.includes('@staticmethod')) {
        modifiers.push('static');
      }
      if (element.decorators.includes('@classmethod')) {
        modifiers.push('classmethod');
      }
      if (element.decorators.includes('@property')) {
        modifiers.push('property');
      }
      if (element.decorators.some(d => d.includes('abstract'))) {
        modifiers.push('abstract');
      }
    }
    
    // Check for private/protected based on naming convention
    if (element.name.startsWith('__') && !element.name.endsWith('__')) {
      modifiers.push('private');
    } else if (element.name.startsWith('_') && !element.name.startsWith('__')) {
      modifiers.push('protected');
    } else {
      modifiers.push('public');
    }
    
    return modifiers;
  }
}