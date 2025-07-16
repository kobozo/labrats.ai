import { BaseLanguageParser } from './base-parser';
import { ParsedCodeElement } from '../code-parser-service';

interface LanguagePatterns {
  functionPattern?: RegExp;
  classPattern?: RegExp;
  methodPattern?: RegExp;
  importPattern?: RegExp;
  commentPattern?: RegExp;
}

/**
 * Generic regex-based parser for languages without dedicated parsers
 */
export class GenericRegexParser extends BaseLanguageParser {
  private patterns: LanguagePatterns;
  private extensions: string[];

  constructor(language: string, extensions: string[], patterns: LanguagePatterns) {
    super(language);
    this.extensions = extensions;
    this.patterns = patterns;
  }

  getSupportedExtensions(): string[] {
    return this.extensions;
  }

  async parseFile(filePath: string, content: string): Promise<ParsedCodeElement[]> {
    const elements: ParsedCodeElement[] = [];
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
    
    // Extract imports
    const imports: string[] = [];
    if (this.patterns.importPattern) {
      const importMatches = Array.from(content.matchAll(this.patterns.importPattern));
      for (const match of importMatches) {
        imports.push(match[1] || match[0]);
      }
    }
    
    // Add file-level element
    elements.push(this.createFileElement(filePath, content, imports));
    
    // Extract functions
    if (this.patterns.functionPattern) {
      const funcMatches = Array.from(content.matchAll(this.patterns.functionPattern));
      for (const match of funcMatches) {
        const funcName = match[1];
        const funcContent = match[0];
        const lineNumbers = this.getLineNumbers(content, funcContent, match.index!);
        
        elements.push({
          type: 'function',
          name: funcName,
          content: funcContent,
          startLine: lineNumbers.startLine,
          endLine: lineNumbers.endLine,
          filePath,
          language: this.language,
          complexity: this.calculateComplexity(funcContent),
        });
      }
    }
    
    // Extract classes
    if (this.patterns.classPattern) {
      const classMatches = Array.from(content.matchAll(this.patterns.classPattern));
      for (const match of classMatches) {
        const className = match[1];
        const classContent = match[0];
        const lineNumbers = this.getLineNumbers(content, classContent, match.index!);
        
        elements.push({
          type: 'class',
          name: className,
          content: classContent,
          startLine: lineNumbers.startLine,
          endLine: lineNumbers.endLine,
          filePath,
          language: this.language,
          complexity: this.calculateComplexity(classContent),
        });
      }
    }
    
    return elements;
  }
}

// Create parsers for common languages

export function createRubyParser(): GenericRegexParser {
  return new GenericRegexParser('ruby', ['.rb'], {
    functionPattern: /def\s+(\w+)[\s\S]*?end/g,
    classPattern: /class\s+(\w+)[\s\S]*?end/g,
    importPattern: /require\s+['"]([^'"]+)['"]/g,
  });
}

export function createPHPParser(): GenericRegexParser {
  return new GenericRegexParser('php', ['.php'], {
    functionPattern: /function\s+(\w+)\s*\([^)]*\)\s*\{[^}]*\}/g,
    classPattern: /class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{[\s\S]*?\n\}/g,
    importPattern: /(?:use|require|include)\s+([^;]+);/g,
  });
}

export function createCSharpParser(): GenericRegexParser {
  return new GenericRegexParser('csharp', ['.cs'], {
    functionPattern: /(?:public|private|protected|internal|static|virtual|override|async)\s+[\w<>[\]]+\s+(\w+)\s*\([^)]*\)\s*\{/g,
    classPattern: /(?:public|private|protected|internal|abstract|sealed|static)\s+class\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*[^{]+)?\s*\{/g,
    importPattern: /using\s+([^;]+);/g,
  });
}

export function createRustParser(): GenericRegexParser {
  return new GenericRegexParser('rust', ['.rs'], {
    functionPattern: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?\s*\{/g,
    classPattern: /(?:pub\s+)?struct\s+(\w+)(?:<[^>]+>)?\s*[{;]/g,
    importPattern: /use\s+([^;]+);/g,
  });
}

export function createSwiftParser(): GenericRegexParser {
  return new GenericRegexParser('swift', ['.swift'], {
    functionPattern: /func\s+(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?\s*\{/g,
    classPattern: /(?:public|private|internal|open|fileprivate)?\s*class\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*[^{]+)?\s*\{/g,
    importPattern: /import\s+(\w+)/g,
  });
}

export function createKotlinParser(): GenericRegexParser {
  return new GenericRegexParser('kotlin', ['.kt'], {
    functionPattern: /fun\s+(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*[={]/g,
    classPattern: /(?:data\s+)?class\s+(\w+)(?:<[^>]+>)?(?:\s*\([^)]*\))?(?:\s*:\s*[^{]+)?\s*\{/g,
    importPattern: /import\s+([^;]+)/g,
  });
}