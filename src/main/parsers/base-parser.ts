import { ParsedCodeElement } from '../code-parser-service';

export abstract class BaseLanguageParser {
  protected language: string;

  constructor(language: string) {
    this.language = language;
  }

  /**
   * Parse a file and extract code elements
   */
  abstract parseFile(filePath: string, content: string): Promise<ParsedCodeElement[]>;

  /**
   * Check if this parser can handle the given file
   */
  canParse(filePath: string): boolean {
    const extensions = this.getSupportedExtensions();
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return extensions.includes(ext);
  }

  /**
   * Get supported file extensions
   */
  abstract getSupportedExtensions(): string[];

  /**
   * Helper to create a file-level element
   */
  protected createFileElement(filePath: string, content: string, imports?: string[], exports?: string[]): ParsedCodeElement {
    const lines = content.split('\n');
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
    
    return {
      type: 'function', // Using 'function' as a generic file type
      name: fileName,
      content: content,
      startLine: 1,
      endLine: lines.length,
      filePath,
      language: this.language,
      imports,
      exports,
    };
  }

  /**
   * Calculate cyclomatic complexity (basic implementation)
   */
  protected calculateComplexity(content: string): number {
    let complexity = 1;
    
    // Common control flow keywords across languages
    const controlFlowPatterns = [
      /\bif\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\band\b/g,
      /\bor\b/g,
      /\?\s*:/g, // ternary operator
    ];
    
    controlFlowPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }

  /**
   * Extract line numbers for a substring within content
   */
  protected getLineNumbers(fullContent: string, substring: string, startIndex: number): { startLine: number; endLine: number } {
    const lines = fullContent.split('\n');
    let currentIndex = 0;
    let startLine = 1;
    let endLine = 1;
    let foundStart = false;
    
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1; // +1 for newline
      
      if (!foundStart && currentIndex + lineLength > startIndex) {
        startLine = i + 1;
        foundStart = true;
      }
      
      if (foundStart && currentIndex + lineLength >= startIndex + substring.length) {
        endLine = i + 1;
        break;
      }
      
      currentIndex += lineLength;
    }
    
    return { startLine, endLine };
  }
}