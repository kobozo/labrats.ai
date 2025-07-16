import { BaseLanguageParser } from './base-parser';
import { PythonParser } from './python-parser';
import { JavaParser } from './java-parser';
import { GoParser } from './go-parser';
import { 
  createRubyParser, 
  createPHPParser, 
  createCSharpParser, 
  createRustParser, 
  createSwiftParser, 
  createKotlinParser 
} from './generic-regex-parser';
import * as path from 'path';

export class ParserRegistry {
  private static instance: ParserRegistry;
  private parsers: Map<string, BaseLanguageParser> = new Map();
  private extensionToLanguage: Map<string, string> = new Map();

  private constructor() {
    this.registerDefaultParsers();
  }

  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  /**
   * Register default parsers
   */
  private registerDefaultParsers(): void {
    // Register specialized parsers
    this.registerParser('python', new PythonParser());
    this.registerParser('java', new JavaParser());
    this.registerParser('go', new GoParser());
    
    // Register regex-based parsers for additional languages
    this.registerParser('ruby', createRubyParser());
    this.registerParser('php', createPHPParser());
    this.registerParser('csharp', createCSharpParser());
    this.registerParser('rust', createRustParser());
    this.registerParser('swift', createSwiftParser());
    this.registerParser('kotlin', createKotlinParser());
  }

  /**
   * Register a parser for a language
   */
  registerParser(language: string, parser: BaseLanguageParser): void {
    this.parsers.set(language, parser);
    
    // Register file extensions
    const extensions = parser.getSupportedExtensions();
    for (const ext of extensions) {
      this.extensionToLanguage.set(ext, language);
    }
    
    console.log(`[PARSER-REGISTRY] Registered parser for ${language} with extensions: ${extensions.join(', ')}`);
  }

  /**
   * Get parser for a file
   */
  getParserForFile(filePath: string): BaseLanguageParser | null {
    const ext = path.extname(filePath).toLowerCase();
    const language = this.extensionToLanguage.get(ext);
    
    if (!language) {
      return null;
    }
    
    return this.parsers.get(language) || null;
  }

  /**
   * Get parser by language
   */
  getParserByLanguage(language: string): BaseLanguageParser | null {
    return this.parsers.get(language) || null;
  }

  /**
   * Get all supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.extensionToLanguage.keys());
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Check if a file is supported
   */
  isFileSupported(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensionToLanguage.has(ext);
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.extensionToLanguage.get(ext) || null;
  }
}