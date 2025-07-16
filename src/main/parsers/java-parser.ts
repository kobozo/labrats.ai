import { BaseLanguageParser } from './base-parser';
import { ParsedCodeElement } from '../code-parser-service';

interface JavaElement {
  type: 'class' | 'interface' | 'enum' | 'method' | 'function' | 'import';
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
  modifiers?: string[];
  javadoc?: string;
  parameters?: Array<{ name: string; type: string }>;
  returnType?: string;
  parentClass?: string;
  implements?: string[];
  extends?: string;
}

export class JavaParser extends BaseLanguageParser {
  constructor() {
    super('java');
  }

  getSupportedExtensions(): string[] {
    return ['.java'];
  }

  async parseFile(filePath: string, content: string): Promise<ParsedCodeElement[]> {
    const elements: ParsedCodeElement[] = [];
    const javaElements = this.extractJavaElements(content);
    
    // Extract imports
    const imports = javaElements
      .filter(el => el.type === 'import')
      .map(el => el.name);
    
    // Add file-level element
    elements.push(this.createFileElement(filePath, content, imports));
    
    // Convert Java elements to ParsedCodeElements
    for (const javaElement of javaElements) {
      if (javaElement.type === 'import') continue; // Already handled at file level
      
      const lineNumbers = this.getLineNumbers(content, javaElement.content, javaElement.startIndex);
      
      const element: ParsedCodeElement = {
        type: javaElement.type === 'interface' || javaElement.type === 'enum' ? javaElement.type : 
              javaElement.type === 'method' ? 'method' : 
              javaElement.type === 'class' ? 'class' : 'function',
        name: javaElement.parentClass ? `${javaElement.parentClass}.${javaElement.name}` : javaElement.name,
        content: javaElement.content,
        startLine: lineNumbers.startLine,
        endLine: lineNumbers.endLine,
        filePath,
        language: this.language,
        parameters: javaElement.parameters,
        returnType: javaElement.returnType,
        jsdoc: javaElement.javadoc,
        complexity: this.calculateComplexity(javaElement.content),
        modifiers: javaElement.modifiers,
      };
      
      elements.push(element);
    }
    
    return elements;
  }

  private extractJavaElements(content: string): JavaElement[] {
    const elements: JavaElement[] = [];
    
    // Extract imports
    const importRegex = /^import\s+(static\s+)?([^;]+);/gm;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const isStatic = !!match[1];
      const importPath = match[2];
      
      elements.push({
        type: 'import',
        name: (isStatic ? 'static ' : '') + importPath,
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
    
    // Extract package declaration
    const packageRegex = /^package\s+([^;]+);/m;
    const packageMatch = content.match(packageRegex);
    const packageName = packageMatch ? packageMatch[1] : undefined;
    
    // Extract classes, interfaces, and enums
    this.extractTypeDeclarations(content, elements);
    
    return elements;
  }

  private extractTypeDeclarations(content: string, elements: JavaElement[]): void {
    // Regex for class/interface/enum declarations
    const typeRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?((?:public|private|protected|abstract|final|static|strictfp)\s+)*(?:(class|interface|enum)\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+([^\s{]+))?(?:\s+implements\s+([^{]+))?)\s*\{/g;
    
    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const javadoc = this.extractJavadoc(content, match.index);
      const modifiers = match[1] ? match[1].trim().split(/\s+/) : [];
      const typeKeyword = match[2];
      const typeName = match[3];
      const extendsClause = match[4];
      const implementsClause = match[5];
      
      const typeStart = match.index;
      const typeEnd = this.findBlockEnd(content, typeStart + match[0].length - 1);
      const typeContent = content.substring(typeStart, typeEnd);
      
      const typeElement: JavaElement = {
        type: typeKeyword as 'class' | 'interface' | 'enum',
        name: typeName,
        content: typeContent,
        startIndex: typeStart,
        endIndex: typeEnd,
        modifiers,
        javadoc,
        extends: extendsClause,
        implements: implementsClause ? implementsClause.split(',').map(s => s.trim()) : undefined,
      };
      
      elements.push(typeElement);
      
      // Extract methods within the type
      this.extractMethods(typeContent, typeName, typeStart, elements, content);
    }
  }

  private extractMethods(classContent: string, className: string, classOffset: number, elements: JavaElement[], fullContent: string): void {
    // Regex for method declarations
    const methodRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?((?:public|private|protected|abstract|final|static|synchronized|native|strictfp)\s+)*(?:(\w+(?:<[^>]+>)?)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:throws\s+([^{]+))?\s*(\{|;)/g;
    
    let match;
    while ((match = methodRegex.exec(classContent)) !== null) {
      const javadoc = this.extractJavadoc(classContent, match.index);
      const modifiers = match[1] ? match[1].trim().split(/\s+/) : [];
      const returnType = match[2];
      const methodName = match[3];
      const paramsStr = match[4];
      const throwsClause = match[5];
      const hasBody = match[6] === '{';
      
      // Skip constructors and non-method declarations
      if (!returnType && methodName === className) {
        // This is a constructor
        continue;
      }
      
      if (!hasBody && !modifiers.includes('abstract')) {
        // Skip if it's not a method declaration
        continue;
      }
      
      const methodStart = classOffset + match.index;
      let methodEnd: number;
      
      if (hasBody) {
        methodEnd = this.findBlockEnd(fullContent, methodStart + match[0].length - 1);
      } else {
        methodEnd = methodStart + match[0].length;
      }
      
      const methodContent = fullContent.substring(methodStart, methodEnd);
      const parameters = this.parseJavaParameters(paramsStr);
      
      elements.push({
        type: 'method',
        name: methodName,
        content: methodContent,
        startIndex: methodStart,
        endIndex: methodEnd,
        modifiers,
        javadoc,
        parameters,
        returnType: returnType || 'void',
        parentClass: className,
      });
    }
  }

  private extractJavadoc(content: string, position: number): string | undefined {
    // Look backwards for Javadoc comment
    const beforeContent = content.substring(0, position);
    const javadocRegex = /\/\*\*([\s\S]*?)\*\/\s*$/;
    const match = beforeContent.match(javadocRegex);
    
    if (match) {
      const javadoc = match[1];
      // Clean up the Javadoc
      return javadoc
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim();
    }
    
    return undefined;
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
      if (!inComment && !inMultiLineComment && !inChar && char === '"' && content[i - 1] !== '\\') {
        inString = !inString;
      }
      
      // Handle character literals
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

  private parseJavaParameters(paramsStr: string): Array<{ name: string; type: string }> {
    if (!paramsStr.trim()) return [];
    
    const params: Array<{ name: string; type: string }> = [];
    const paramParts = this.splitParameters(paramsStr);
    
    for (const param of paramParts) {
      const trimmed = param.trim();
      if (!trimmed) continue;
      
      // Handle annotations
      const withoutAnnotations = trimmed.replace(/@\w+(?:\([^)]*\))?\s*/g, '');
      
      // Handle varargs
      const varargMatch = withoutAnnotations.match(/^(.+?)\.\.\.\s*(\w+)$/);
      if (varargMatch) {
        params.push({
          type: varargMatch[1].trim() + '...',
          name: varargMatch[2],
        });
        continue;
      }
      
      // Regular parameter (type name)
      const parts = withoutAnnotations.trim().split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[parts.length - 1];
        const type = parts.slice(0, -1).join(' ');
        params.push({ name, type });
      }
    }
    
    return params;
  }

  private splitParameters(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;
    
    for (let i = 0; i < paramsStr.length; i++) {
      const char = paramsStr[i];
      
      if (char === '<' || char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']') {
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
}