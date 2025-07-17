import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { ParserRegistry } from './parsers/parser-registry';

export interface ParsedCodeElement {
  type: 'function' | 'class' | 'method' | 'variable' | 'import' | 'export' | 'interface' | 'enum';
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  filePath: string;
  language: string;
  imports?: string[];
  exports?: string[];
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  modifiers?: string[]; // public, private, static, async, etc.
  jsdoc?: string;
  complexity?: number;
}

export class CodeParserService {
  private static instance: CodeParserService;
  private parserRegistry: ParserRegistry;

  private constructor() {
    this.parserRegistry = ParserRegistry.getInstance();
  }

  static getInstance(): CodeParserService {
    if (!CodeParserService.instance) {
      CodeParserService.instance = new CodeParserService();
    }
    return CodeParserService.instance;
  }

  /**
   * Parse a file and extract code elements
   */
  async parseFile(filePath: string): Promise<ParsedCodeElement[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    
    // Try to get a specialized parser first
    const parser = this.parserRegistry.getParserForFile(filePath);
    if (parser) {
      return parser.parseFile(filePath, content);
    }
    
    // Fall back to TypeScript parser for TS/JS files
    const language = this.detectLanguage(filePath);
    if (language === 'typescript' || language === 'javascript') {
      return this.parseTypeScriptFile(filePath, content);
    }
    
    // Fall back to generic parser for unsupported languages
    return this.parseGenericFile(filePath, content, language);
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.dart': 'dart',
    };
    
    return languageMap[ext] || 'unknown';
  }

  /**
   * Parse TypeScript/JavaScript file using TypeScript compiler API
   */
  private parseTypeScriptFile(filePath: string, content: string): ParsedCodeElement[] {
    const elements: ParsedCodeElement[] = [];
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const lines = content.split('\n');
    
    // Helper to get line numbers
    const getLineNumber = (pos: number): number => {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    };

    // Helper to extract JSDoc
    const getJSDoc = (node: ts.Node): string | undefined => {
      const jsDocNodes = (node as any).jsDoc;
      if (jsDocNodes && jsDocNodes.length > 0) {
        return jsDocNodes.map((doc: any) => doc.getText()).join('\n');
      }
      return undefined;
    };

    // Helper to extract modifiers
    const getModifiers = (node: ts.Node): string[] => {
      const modifiers: string[] = [];
      const nodeWithModifiers = node as any;
      if (nodeWithModifiers.modifiers) {
        nodeWithModifiers.modifiers.forEach((modifier: ts.Modifier) => {
          modifiers.push(ts.SyntaxKind[modifier.kind].toLowerCase());
        });
      }
      return modifiers;
    };

    // Visit each node in the AST
    const visit = (node: ts.Node) => {
      // Extract imports
      if (ts.isImportDeclaration(node)) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
        const startLine = getLineNumber(node.getStart());
        const endLine = getLineNumber(node.getEnd());
        
        elements.push({
          type: 'import',
          name: importPath,
          content: node.getText(),
          startLine,
          endLine,
          filePath,
          language: 'typescript',
        });
      }

      // Extract exports
      if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
        const startLine = getLineNumber(node.getStart());
        const endLine = getLineNumber(node.getEnd());
        
        elements.push({
          type: 'export',
          name: 'export',
          content: node.getText(),
          startLine,
          endLine,
          filePath,
          language: 'typescript',
        });
      }

      // Extract functions
      if (ts.isFunctionDeclaration(node) && node.name) {
        const functionName = node.name.getText();
        const startLine = getLineNumber(node.getStart());
        const endLine = getLineNumber(node.getEnd());
        const params = this.extractParameters(node);
        const returnType = node.type ? node.type.getText() : undefined;
        
        elements.push({
          type: 'function',
          name: functionName,
          content: node.getText(),
          startLine,
          endLine,
          filePath,
          language: 'typescript',
          parameters: params,
          returnType,
          modifiers: getModifiers(node),
          jsdoc: getJSDoc(node),
          complexity: this.calculateComplexity(node),
        });
      }

      // Extract classes
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.getText();
        const startLine = getLineNumber(node.getStart());
        const endLine = getLineNumber(node.getEnd());
        
        elements.push({
          type: 'class',
          name: className,
          content: node.getText(),
          startLine,
          endLine,
          filePath,
          language: 'typescript',
          modifiers: getModifiers(node),
          jsdoc: getJSDoc(node),
        });

        // Extract methods within the class
        node.members.forEach(member => {
          if (ts.isMethodDeclaration(member) && member.name) {
            const methodName = member.name.getText();
            const methodStartLine = getLineNumber(member.getStart());
            const methodEndLine = getLineNumber(member.getEnd());
            const params = this.extractParameters(member);
            const returnType = member.type ? member.type.getText() : undefined;
            
            elements.push({
              type: 'method',
              name: `${className}.${methodName}`,
              content: member.getText(),
              startLine: methodStartLine,
              endLine: methodEndLine,
              filePath,
              language: 'typescript',
              parameters: params,
              returnType,
              modifiers: getModifiers(member),
              jsdoc: getJSDoc(member),
              complexity: this.calculateComplexity(member),
            });
          }
        });
      }

      // Extract interfaces
      if (ts.isInterfaceDeclaration(node) && node.name) {
        const interfaceName = node.name.getText();
        const startLine = getLineNumber(node.getStart());
        const endLine = getLineNumber(node.getEnd());
        
        elements.push({
          type: 'interface',
          name: interfaceName,
          content: node.getText(),
          startLine,
          endLine,
          filePath,
          language: 'typescript',
          jsdoc: getJSDoc(node),
        });
      }

      // Continue traversing
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Extract file-level element
    elements.unshift({
      type: 'function', // Using 'function' as a generic file type for now
      name: path.basename(filePath),
      content: content,
      startLine: 1,
      endLine: lines.length,
      filePath,
      language: 'typescript',
      imports: elements.filter(e => e.type === 'import').map(e => e.name),
      exports: elements.filter(e => e.type === 'export').map(e => e.name),
    });

    return elements;
  }

  /**
   * Extract parameters from a function/method
   */
  private extractParameters(node: ts.FunctionDeclaration | ts.MethodDeclaration): Array<{ name: string; type?: string }> {
    return node.parameters.map(param => ({
      name: param.name.getText(),
      type: param.type ? param.type.getText() : undefined,
    }));
  }

  /**
   * Calculate cyclomatic complexity of a function/method
   */
  private calculateComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    const visit = (node: ts.Node) => {
      // Increment complexity for control flow statements
      if (
        ts.isIfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isConditionalExpression(node) ||
        ts.isCaseClause(node)
      ) {
        complexity++;
      }

      // Increment for logical operators
      if (ts.isBinaryExpression(node)) {
        const operator = node.operatorToken.kind;
        if (operator === ts.SyntaxKind.AmpersandAmpersandToken || 
            operator === ts.SyntaxKind.BarBarToken) {
          complexity++;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(node);
    return complexity;
  }

  /**
   * Parse generic file (fallback for non-TypeScript files)
   */
  private parseGenericFile(filePath: string, content: string, language: string): ParsedCodeElement[] {
    const lines = content.split('\n');
    
    // For now, just return the whole file as a single element
    // TODO: Implement language-specific parsing using tree-sitter
    return [{
      type: 'function',
      name: path.basename(filePath),
      content: content,
      startLine: 1,
      endLine: lines.length,
      filePath,
      language,
    }];
  }

  /**
   * Extract code blocks from markdown files
   */
  async parseMarkdown(filePath: string): Promise<ParsedCodeElement[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const elements: ParsedCodeElement[] = [];
    const lines = content.split('\n');
    
    let inCodeBlock = false;
    let codeBlockStart = 0;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';
    
    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockStart = index + 1;
          codeBlockLanguage = line.slice(3).trim() || 'unknown';
          codeBlockContent = [];
        } else {
          // End of code block
          if (codeBlockContent.length > 0) {
            elements.push({
              type: 'function',
              name: `code-block-${codeBlockStart}`,
              content: codeBlockContent.join('\n'),
              startLine: codeBlockStart,
              endLine: index,
              filePath,
              language: codeBlockLanguage,
            });
          }
          inCodeBlock = false;
        }
      } else if (inCodeBlock) {
        codeBlockContent.push(line);
      }
    });
    
    return elements;
  }
}