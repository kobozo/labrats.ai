import { BaseLanguageParser } from './base-parser';
import { ParsedCodeElement } from '../code-parser-service';

interface GoElement {
  type: 'function' | 'method' | 'interface' | 'struct' | 'import' | 'variable';
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
  receiver?: { name: string; type: string };
  parameters?: Array<{ name: string; type: string }>;
  returns?: string[];
  comment?: string;
  exported?: boolean;
}

export class GoParser extends BaseLanguageParser {
  constructor() {
    super('go');
  }

  getSupportedExtensions(): string[] {
    return ['.go'];
  }

  async parseFile(filePath: string, content: string): Promise<ParsedCodeElement[]> {
    const elements: ParsedCodeElement[] = [];
    const goElements = this.extractGoElements(content);
    
    // Extract imports
    const imports = goElements
      .filter(el => el.type === 'import')
      .map(el => el.name);
    
    // Add file-level element
    elements.push(this.createFileElement(filePath, content, imports));
    
    // Convert Go elements to ParsedCodeElements
    for (const goElement of goElements) {
      if (goElement.type === 'import') continue; // Already handled at file level
      
      const lineNumbers = this.getLineNumbers(content, goElement.content, goElement.startIndex);
      
      // Map Go types to our generic types
      let elementType: ParsedCodeElement['type'];
      if (goElement.type === 'struct') {
        elementType = 'class';
      } else if (goElement.type === 'interface') {
        elementType = 'interface';
      } else if (goElement.type === 'method') {
        elementType = 'method';
      } else if (goElement.type === 'variable') {
        elementType = 'variable';
      } else {
        elementType = 'function';
      }
      
      const element: ParsedCodeElement = {
        type: elementType,
        name: goElement.receiver ? `${goElement.receiver.type}.${goElement.name}` : goElement.name,
        content: goElement.content,
        startLine: lineNumbers.startLine,
        endLine: lineNumbers.endLine,
        filePath,
        language: this.language,
        parameters: goElement.parameters,
        returnType: goElement.returns ? goElement.returns.join(', ') : undefined,
        jsdoc: goElement.comment,
        complexity: this.calculateComplexity(goElement.content),
        modifiers: goElement.exported ? ['public'] : ['private'],
      };
      
      elements.push(element);
    }
    
    return elements;
  }

  private extractGoElements(content: string): GoElement[] {
    const elements: GoElement[] = [];
    
    // Extract imports
    this.extractImports(content, elements);
    
    // Extract type declarations (structs and interfaces)
    this.extractTypeDeclarations(content, elements);
    
    // Extract functions and methods
    this.extractFunctions(content, elements);
    
    // Extract package-level variables and constants
    this.extractPackageVariables(content, elements);
    
    return elements;
  }

  private extractImports(content: string, elements: GoElement[]): void {
    // Single import
    const singleImportRegex = /^import\s+"([^"]+)"/gm;
    let match;
    
    while ((match = singleImportRegex.exec(content)) !== null) {
      elements.push({
        type: 'import',
        name: match[1],
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    // Multiple imports
    const multiImportRegex = /^import\s*\(([\s\S]*?)\)/gm;
    while ((match = multiImportRegex.exec(content)) !== null) {
      const importBlock = match[1];
      const importLines = importBlock.split('\n').filter(line => line.trim());
      
      for (const line of importLines) {
        const importMatch = line.match(/^\s*(?:(\w+)\s+)?"([^"]+)"/);
        if (importMatch) {
          const alias = importMatch[1];
          const path = importMatch[2];
          const importName = alias ? `${alias} "${path}"` : path;
          
          elements.push({
            type: 'import',
            name: importName,
            content: line.trim(),
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
        }
      }
    }
  }

  private extractTypeDeclarations(content: string, elements: GoElement[]): void {
    // Extract structs
    const structRegex = /(?:\/\/.*\n)*type\s+(\w+)\s+struct\s*\{/g;
    let match;
    
    while ((match = structRegex.exec(content)) !== null) {
      const structName = match[1];
      const comment = this.extractComment(content, match.index);
      const structStart = match.index;
      const structEnd = this.findBlockEnd(content, structStart + match[0].length - 1);
      const structContent = content.substring(structStart, structEnd);
      
      elements.push({
        type: 'struct',
        name: structName,
        content: structContent,
        startIndex: structStart,
        endIndex: structEnd,
        comment,
        exported: this.isExported(structName),
      });
    }
    
    // Extract interfaces
    const interfaceRegex = /(?:\/\/.*\n)*type\s+(\w+)\s+interface\s*\{/g;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const interfaceName = match[1];
      const comment = this.extractComment(content, match.index);
      const interfaceStart = match.index;
      const interfaceEnd = this.findBlockEnd(content, interfaceStart + match[0].length - 1);
      const interfaceContent = content.substring(interfaceStart, interfaceEnd);
      
      elements.push({
        type: 'interface',
        name: interfaceName,
        content: interfaceContent,
        startIndex: interfaceStart,
        endIndex: interfaceEnd,
        comment,
        exported: this.isExported(interfaceName),
      });
    }
  }

  private extractFunctions(content: string, elements: GoElement[]): void {
    // Regex for functions and methods
    const funcRegex = /(?:\/\/.*\n)*func\s+(?:\((\w+)\s+([^)]+)\)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:\(([^)]+)\)|([^{\s]+))?\s*\{/g;
    let match;
    
    while ((match = funcRegex.exec(content)) !== null) {
      const receiverName = match[1];
      const receiverType = match[2];
      const funcName = match[3];
      const paramsStr = match[4];
      const multipleReturns = match[5];
      const singleReturn = match[6];
      
      const comment = this.extractComment(content, match.index);
      const funcStart = match.index;
      const funcEnd = this.findBlockEnd(content, funcStart + match[0].length - 1);
      const funcContent = content.substring(funcStart, funcEnd);
      
      const parameters = this.parseParameters(paramsStr);
      const returns = this.parseReturns(multipleReturns || singleReturn);
      
      const element: GoElement = {
        type: receiverName ? 'method' : 'function',
        name: funcName,
        content: funcContent,
        startIndex: funcStart,
        endIndex: funcEnd,
        parameters,
        returns,
        comment,
        exported: this.isExported(funcName),
      };
      
      if (receiverName && receiverType) {
        element.receiver = {
          name: receiverName,
          type: this.cleanReceiverType(receiverType),
        };
      }
      
      elements.push(element);
    }
  }

  private extractPackageVariables(content: string, elements: GoElement[]): void {
    // Extract var and const declarations at package level
    const varRegex = /^(?:\/\/.*\n)*(var|const)\s+(\w+)(?:\s+([^=\n]+))?\s*=/gm;
    let match;
    
    while ((match = varRegex.exec(content)) !== null) {
      const keyword = match[1];
      const varName = match[2];
      const varType = match[3]?.trim();
      
      // Find the end of the declaration
      let endIndex = match.index + match[0].length;
      const remainingContent = content.substring(endIndex);
      const semiIndex = remainingContent.indexOf(';');
      const newlineIndex = remainingContent.indexOf('\n');
      
      if (semiIndex !== -1 && (newlineIndex === -1 || semiIndex < newlineIndex)) {
        endIndex += semiIndex + 1;
      } else if (newlineIndex !== -1) {
        endIndex += newlineIndex;
      }
      
      const varContent = content.substring(match.index, endIndex).trim();
      const comment = this.extractComment(content, match.index);
      
      elements.push({
        type: 'variable',
        name: varName,
        content: varContent,
        startIndex: match.index,
        endIndex: endIndex,
        comment,
        exported: this.isExported(varName),
      });
    }
  }

  private extractComment(content: string, position: number): string | undefined {
    // Look for comments before the position
    const lines = content.substring(0, position).split('\n');
    const comments: string[] = [];
    
    // Look backwards for comment lines
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        comments.unshift(line.substring(2).trim());
      } else if (line === '') {
        // Continue looking through empty lines
        continue;
      } else {
        // Stop at first non-comment, non-empty line
        break;
      }
    }
    
    return comments.length > 0 ? comments.join('\n') : undefined;
  }

  private findBlockEnd(content: string, openBracePos: number): number {
    let braceCount = 1;
    let i = openBracePos + 1;
    let inString = false;
    let inChar = false;
    let inComment = false;
    let inMultiLineComment = false;
    
    while (i < content.length && braceCount > 0) {
      const char = content[i];
      const nextChar = content[i + 1];
      
      // Handle string literals
      if (!inComment && !inMultiLineComment && !inChar) {
        if (char === '"' && content[i - 1] !== '\\') {
          inString = !inString;
        } else if (char === '`') {
          // Handle raw string literals
          const rawStringEnd = content.indexOf('`', i + 1);
          if (rawStringEnd !== -1) {
            i = rawStringEnd;
          }
        }
      }
      
      // Handle rune literals
      if (!inComment && !inMultiLineComment && !inString && char === "'" && content[i - 1] !== '\\') {
        inChar = !inChar;
      }
      
      // Handle comments
      if (!inString && !inChar) {
        if (char === '/' && nextChar === '/' && !inMultiLineComment) {
          inComment = true;
        } else if (char === '/' && nextChar === '*' && !inComment) {
          inMultiLineComment = true;
          i++; // Skip the *
        } else if (char === '*' && nextChar === '/' && inMultiLineComment) {
          inMultiLineComment = false;
          i++; // Skip the /
        } else if (char === '\n' && inComment) {
          inComment = false;
        }
      }
      
      // Count braces only outside strings, chars, and comments
      if (!inString && !inChar && !inComment && !inMultiLineComment) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      i++;
    }
    
    return i;
  }

  private parseParameters(paramsStr: string): Array<{ name: string; type: string }> {
    if (!paramsStr.trim()) return [];
    
    const params: Array<{ name: string; type: string }> = [];
    const paramParts = this.splitParameters(paramsStr);
    
    for (const param of paramParts) {
      const trimmed = param.trim();
      if (!trimmed) continue;
      
      // Handle variadic parameters
      const variadicMatch = trimmed.match(/^(\w+)?\s*\.\.\.(.*)/);
      if (variadicMatch) {
        const name = variadicMatch[1] || '';
        const type = '...' + variadicMatch[2].trim();
        if (name) {
          params.push({ name, type });
        }
        continue;
      }
      
      // Handle parameters with same type (e.g., "x, y int")
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const type = parts[parts.length - 1];
        const names = parts.slice(0, -1).join(' ').split(',');
        
        for (const name of names) {
          const cleanName = name.trim();
          if (cleanName) {
            params.push({ name: cleanName, type });
          }
        }
      } else if (parts.length === 1) {
        // Type only (common in interface methods)
        params.push({ name: '', type: parts[0] });
      }
    }
    
    return params;
  }

  private parseReturns(returnsStr: string | undefined): string[] | undefined {
    if (!returnsStr) return undefined;
    
    const trimmed = returnsStr.trim();
    if (!trimmed) return undefined;
    
    // If it's wrapped in parentheses, it's multiple returns
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      const inner = trimmed.slice(1, -1);
      return this.splitParameters(inner).map(s => s.trim()).filter(s => s);
    }
    
    // Single return
    return [trimmed];
  }

  private splitParameters(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    
    for (let i = 0; i < paramsStr.length; i++) {
      const char = paramsStr[i];
      
      if (char === '(' || char === '[' || char === '{') {
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
    
    if (current) {
      params.push(current);
    }
    
    return params;
  }

  private cleanReceiverType(receiverType: string): string {
    // Remove pointer indicators and clean up the type
    return receiverType.replace(/^\*/, '').trim();
  }

  private isExported(name: string): boolean {
    // In Go, exported names start with an uppercase letter
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }
}