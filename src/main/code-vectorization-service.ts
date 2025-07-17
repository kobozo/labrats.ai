import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as https from 'https';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { BrowserWindow } from 'electron';
import { VectorStorageService, VectorDocument, VectorIndex } from './vector-storage-service';
import { CodeParserService, ParsedCodeElement } from './code-parser-service';
import { DexyVectorizationService } from './dexy-vectorization-service';
import { CentralizedAPIKeyService } from '../services/centralized-api-key-service';
import { ReadmeContextService } from './readme-context-service';
import { fileTrackingService } from './file-tracking-service';

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

export interface CodeVectorizationStats {
  totalFiles: number;
  vectorizedFiles: number;
  totalElements: number;
  vectorizedElements: number;
  lastSync: Date | null;
  indexId: string | null;
}

export interface PreScanResult {
  totalFiles: number;
  totalElements: number;
  fileTypes: { [ext: string]: number };
  elementTypes: { [type: string]: number };
}

export interface VectorizationFileState {
  fileHash: string;
  lastVectorized: string;
  elements: {
    [elementKey: string]: {
      elementHash: string;
      vectorId: string;
      lastVectorized: string;
    };
  };
}

export class CodeVectorizationService {
  private static instance: CodeVectorizationService;
  private vectorStorage: VectorStorageService | null = null;
  private codeParser: CodeParserService;
  private dexyService: DexyVectorizationService | null = null;
  private readmeContextService: ReadmeContextService;
  private projectPath: string | null = null;
  private codeIndex: VectorIndex | null = null;
  private lastPreScanResult: PreScanResult | null = null;
  private isCurrentlyVectorizing: boolean = false;
  private fileHashCache: Map<string, string> = new Map();
  private vectorizationState: Map<string, VectorizationFileState> = new Map();

  private constructor() {
    this.codeParser = CodeParserService.getInstance();
    this.readmeContextService = ReadmeContextService.getInstance();
  }

  static getInstance(): CodeVectorizationService {
    if (!CodeVectorizationService.instance) {
      CodeVectorizationService.instance = new CodeVectorizationService();
    }
    return CodeVectorizationService.instance;
  }

  /**
   * Initialize the service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    
    // Initialize vector storage
    this.vectorStorage = new VectorStorageService(projectPath);
    await this.vectorStorage.initialize();
    
    // Initialize Dexy service
    this.dexyService = DexyVectorizationService.getInstance();
    await this.dexyService.initialize(projectPath);
    
    // Initialize README context service
    await this.readmeContextService.initialize(projectPath);
    
    // Initialize file tracking service
    await fileTrackingService.initialize(projectPath);
    
    // Get or create code index
    const config = await this.dexyService.getConfig();
    if (config) {
      this.codeIndex = await this.vectorStorage.getOrCreateCodeIndex(
        config.providerId,
        config.modelId,
        await this.getEmbeddingDimensions()
      );
      console.log('[CODE-VECTORIZATION] Initialized with index:', this.codeIndex.id);
    }
    
    // Load file hash cache from disk
    await this.loadFileHashCache();
    
    // Load vectorization state from disk
    await this.loadVectorizationState();
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return !!(this.vectorStorage && this.dexyService && this.codeIndex);
  }

  /**
   * Get the current project path
   */
  getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Check if currently vectorizing
   */
  isVectorizing(): boolean {
    return this.isCurrentlyVectorizing;
  }

  /**
   * Calculate file hash for change detection
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate hash for a specific code element
   */
  private calculateElementHash(element: ParsedCodeElement): string {
    // Create a unique hash based on element content and metadata
    // Include embedding version to force re-vectorization when format changes
    const hashInput = JSON.stringify({
      embeddingVersion: 'v2', // Increment this when embedding format changes
      type: element.type,
      name: element.name,
      content: element.content,
      startLine: element.startLine,
      endLine: element.endLine,
      parameters: element.parameters,
      returnType: element.returnType,
      jsdoc: element.jsdoc,
      modifiers: element.modifiers,
      imports: element.imports,
      exports: element.exports,
      complexity: element.complexity
    });
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get the file hash cache path (general file tracking)
   */
  private getFileHashCachePath(): string {
    return path.join(this.projectPath!, '.labrats', 'file-tracker.json');
  }

  /**
   * Get the vectorization state path (tracks what's been vectorized)
   */
  private getVectorizationStatePath(): string {
    return path.join(this.projectPath!, '.labrats', 'vectors', 'vectorization-state.json');
  }

  /**
   * Load file hash cache from disk
   */
  private async loadFileHashCache(): Promise<void> {
    try {
      const cachePath = this.getFileHashCachePath();
      if (await fs.promises.access(cachePath).then(() => true).catch(() => false)) {
        const cacheData = await fs.promises.readFile(cachePath, 'utf-8');
        const cache = JSON.parse(cacheData);
        this.fileHashCache = new Map(Object.entries(cache));
        console.log(`[CODE-VECTORIZATION] Loaded ${this.fileHashCache.size} file hashes from cache`);
      }
    } catch (error) {
      console.error('[CODE-VECTORIZATION] Failed to load file hash cache:', error);
      this.fileHashCache = new Map();
    }
  }

  /**
   * Save file hash cache to disk
   */
  private async saveFileHashCache(): Promise<void> {
    try {
      const cachePath = this.getFileHashCachePath();
      const cacheDir = path.dirname(cachePath);
      
      // Ensure directory exists
      await fs.promises.mkdir(cacheDir, { recursive: true });
      
      // Convert Map to object for JSON serialization
      const cacheData = Object.fromEntries(this.fileHashCache);
      await fs.promises.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
      console.log(`[CODE-VECTORIZATION] Saved ${this.fileHashCache.size} file hashes to cache`);
    } catch (error) {
      console.error('[CODE-VECTORIZATION] Failed to save file hash cache:', error);
    }
  }

  /**
   * Load vectorization state from disk
   */
  private async loadVectorizationState(): Promise<void> {
    try {
      const statePath = this.getVectorizationStatePath();
      if (await fs.promises.access(statePath).then(() => true).catch(() => false)) {
        const stateData = await fs.promises.readFile(statePath, 'utf-8');
        const state = JSON.parse(stateData);
        this.vectorizationState = new Map(Object.entries(state));
        console.log(`[CODE-VECTORIZATION] Loaded vectorization state for ${this.vectorizationState.size} files`);
      }
    } catch (error) {
      console.error('[CODE-VECTORIZATION] Failed to load vectorization state:', error);
      this.vectorizationState = new Map();
    }
  }

  /**
   * Save vectorization state to disk
   */
  private async saveVectorizationState(): Promise<void> {
    try {
      const statePath = this.getVectorizationStatePath();
      const stateDir = path.dirname(statePath);
      
      // Ensure directory exists
      await fs.promises.mkdir(stateDir, { recursive: true });
      
      // Convert Map to object for JSON serialization
      const stateData = Object.fromEntries(this.vectorizationState);
      await fs.promises.writeFile(statePath, JSON.stringify(stateData, null, 2));
      console.log(`[CODE-VECTORIZATION] Saved vectorization state for ${this.vectorizationState.size} files`);
    } catch (error) {
      console.error('[CODE-VECTORIZATION] Failed to save vectorization state:', error);
    }
  }

  /**
   * Get existing elements for a file with their hashes
   */
  private async getExistingElements(filePath: string): Promise<Map<string, VectorDocument>> {
    const elementMap = new Map<string, VectorDocument>();
    
    // Get document IDs for this index
    const docIds = await this.vectorStorage!.getDocumentIds(this.codeIndex!.id);
    
    // Find documents for this file
    for (const docId of docIds) {
      const doc = await this.vectorStorage!.getDocument(this.codeIndex!.id, docId);
      if (doc && doc.metadata.filePath === filePath) {
        // Use a combination of type, name, and line as key
        const elementKey = `${doc.metadata.codeType}:${doc.metadata.functionName || doc.metadata.className || doc.metadata.name || 'unnamed'}:${doc.metadata.lineStart}`;
        elementMap.set(elementKey, doc);
      }
    }
    
    return elementMap;
  }

  /**
   * Get all existing documents for a file
   */
  private async getExistingDocuments(filePath: string): Promise<VectorDocument[]> {
    const docs: VectorDocument[] = [];
    
    // Get document IDs for this index
    const docIds = await this.vectorStorage!.getDocumentIds(this.codeIndex!.id);
    
    // Find documents for this file
    for (const docId of docIds) {
      const doc = await this.vectorStorage!.getDocument(this.codeIndex!.id, docId);
      if (doc && doc.metadata.filePath === filePath) {
        docs.push(doc);
      }
    }
    
    return docs;
  }

  /**
   * Check if an element has changed by comparing hashes
   */
  private hasElementChanged(element: ParsedCodeElement, existingDoc: VectorDocument | undefined): boolean {
    if (!existingDoc) return true;
    
    const newHash = this.calculateElementHash(element);
    return existingDoc.metadata.elementHash !== newHash;
  }

  /**
   * Vectorize a single file
   */
  async vectorizeFile(filePath: string, forceReindex: boolean = false): Promise<VectorDocument[]> {
    if (!this.isReady()) {
      throw new Error('Code vectorization service not initialized');
    }

    console.log('[CODE-VECTORIZATION] Processing file:', filePath);
    
    // Check if file has changed using the file tracking service
    const hasChanged = await fileTrackingService.hasFileChanged(filePath);
    
    // Calculate file hash
    const fileHash = await this.calculateFileHash(filePath);
    
    // Check if file has changed at all
    const cachedHash = this.fileHashCache.get(filePath);
    if (!forceReindex && cachedHash === fileHash) {
      // File hasn't changed, return existing vectors
      const existingDocs = await this.getExistingDocuments(filePath);
      console.log(`[CODE-VECTORIZATION] File ${path.basename(filePath)} unchanged (hash match), skipping`);
      return existingDocs;
    }
    
    // Update cache
    this.fileHashCache.set(filePath, fileHash);
    
    // Update file tracking service
    await fileTrackingService.updateFileTracking(filePath);
    
    // Update or create vectorization state for this file
    let fileState = this.vectorizationState.get(filePath);
    if (!fileState) {
      fileState = {
        fileHash: fileHash,
        lastVectorized: new Date().toISOString(),
        elements: {}
      };
      this.vectorizationState.set(filePath, fileState);
    } else {
      fileState.fileHash = fileHash;
      fileState.lastVectorized = new Date().toISOString();
    }
    
    // Get existing elements for this file
    const existingElements = await this.getExistingElements(filePath);
    
    // Parse the file since it changed
    const elements = await this.codeParser.parseFile(filePath);
    const vectorDocs: VectorDocument[] = [];
    const elementsToDelete: string[] = [];
    const elementsToAdd: ParsedCodeElement[] = [];
    let unchangedCount = 0;
    
    // Get file stats
    const stats = await fs.promises.stat(filePath);
    const gitBranch = await this.getCurrentGitBranch();
    
    // Check each element for changes
    for (const element of elements) {
      const elementKey = `${element.type}:${element.name}:${element.startLine}`;
      const existingDoc = existingElements.get(elementKey);
      
      if (!forceReindex && existingDoc && !this.hasElementChanged(element, existingDoc)) {
        // Element unchanged, keep existing vector
        vectorDocs.push(existingDoc);
        existingElements.delete(elementKey); // Remove from map so we know it's still valid
        unchangedCount++;
        continue;
      }
      
      // Element is new or changed
      if (existingDoc) {
        elementsToDelete.push(existingDoc.id);
      }
      elementsToAdd.push(element);
    }
    
    // Delete vectors for removed elements (ones left in existingElements map)
    for (const [key, doc] of existingElements) {
      elementsToDelete.push(doc.id);
      console.log(`[CODE-VECTORIZATION] Deleting removed element: ${key}`);
      // Remove from vectorization state
      if (fileState && fileState.elements[key]) {
        delete fileState.elements[key];
      }
    }
    
    // Delete changed/removed elements
    for (const docId of elementsToDelete) {
      await this.vectorStorage!.deleteDocument(this.codeIndex!.id, docId);
    }
    
    console.log(`[CODE-VECTORIZATION] File ${path.basename(filePath)}: ${unchangedCount} unchanged, ${elementsToAdd.length} to vectorize, ${elementsToDelete.length} deleted`);
    
    // Vectorize new/changed elements
    for (const element of elementsToAdd) {
      // Generate ID for the element
      const elementId = this.generateElementId(filePath, element);
      
      // Generate AI description if it's a significant element
      let aiDescription: string | undefined;
      if (element.type !== 'import' && element.type !== 'export' && element.content.length > 50) {
        try {
          aiDescription = await this.generateAIDescription(element);
        } catch (error) {
          console.error('[CODE-VECTORIZATION] Failed to generate AI description:', error);
        }
      }
      
      // Create content for embedding
      const embeddingContent = await this.createEmbeddingContent(element, aiDescription);
      
      // Generate embedding
      const embedding = await this.generateEmbedding(embeddingContent);
      
      // Create vector document
      const vectorDoc: VectorDocument = {
        id: elementId,
        content: element.content,
        metadata: {
          type: this.mapElementTypeToDocType(element.type),
          filePath: element.filePath,
          fileHash: fileHash,
          elementHash: this.calculateElementHash(element),
          language: element.language,
          functionName: element.type === 'function' || element.type === 'method' ? element.name : undefined,
          className: element.type === 'class' ? element.name : undefined,
          lineStart: element.startLine,
          lineEnd: element.endLine,
          imports: element.imports,
          exports: element.exports,
          complexity: element.complexity,
          aiDescription,
          lastModified: stats.mtime.toISOString(),
          gitBranch,
          codeType: element.type,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        embedding,
      };
      
      // Add to vector storage
      await this.vectorStorage!.addDocument(this.codeIndex!.id, vectorDoc);
      vectorDocs.push(vectorDoc);
      
      // Update vectorization state for this element
      const elementKey = `${element.type}:${element.name}:${element.startLine}`;
      fileState!.elements[elementKey] = {
        elementHash: this.calculateElementHash(element),
        vectorId: elementId,
        lastVectorized: new Date().toISOString()
      };
      
      console.log(`[CODE-VECTORIZATION] Vectorized: ${element.type} ${element.name}`);
    }
    
    return vectorDocs;
  }

  /**
   * Generate element ID
   */
  private generateElementId(filePath: string, element: ParsedCodeElement): string {
    const relativePath = this.projectPath ? path.relative(this.projectPath, filePath) : filePath;
    const identifier = `${relativePath}:${element.type}:${element.name}:${element.startLine}`;
    return `code_${crypto.createHash('md5').update(identifier).digest('hex')}`;
  }

  /**
   * Map parser element type to vector document type
   */
  private mapElementTypeToDocType(elementType: string): VectorDocument['metadata']['type'] {
    const typeMap: { [key: string]: VectorDocument['metadata']['type'] } = {
      'function': 'code-function',
      'class': 'code-class',
      'method': 'code-function',
      'interface': 'code-class',
      'import': 'code-import',
      'export': 'code-import',
      'enum': 'code-class',
      'variable': 'code-block',
    };
    
    return typeMap[elementType] || 'code-block';
  }

  /**
   * Create content for embedding generation
   */
  private async createEmbeddingContent(element: ParsedCodeElement, aiDescription?: string): Promise<string> {
    const parts: string[] = [];
    
    // Add file path context
    const relativePath = this.projectPath ? path.relative(this.projectPath, element.filePath) : element.filePath;
    const fileName = path.basename(element.filePath);
    const dirPath = path.dirname(relativePath);
    parts.push(`File: ${fileName}`);
    parts.push(`Path: ${relativePath}`);
    if (dirPath !== '.') {
      parts.push(`Directory: ${dirPath}`);
    }
    
    // Add element type and name
    parts.push(`${element.type}: ${element.name}`);
    
    // Add language
    parts.push(`Language: ${element.language}`);
    
    // Add modifiers (public, private, static, async, etc.)
    if (element.modifiers && element.modifiers.length > 0) {
      parts.push(`Modifiers: ${element.modifiers.join(', ')}`);
    }
    
    // Add JSDoc if available
    if (element.jsdoc) {
      parts.push(`Documentation: ${element.jsdoc}`);
    }
    
    // Add parameters for functions/methods
    if (element.parameters && element.parameters.length > 0) {
      const params = element.parameters.map(p => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ');
      parts.push(`Parameters: ${params}`);
    }
    
    // Add return type
    if (element.returnType) {
      parts.push(`Returns: ${element.returnType}`);
    }
    
    // Add complexity metric
    if (element.complexity !== undefined) {
      parts.push(`Complexity: ${element.complexity}`);
    }
    
    // Add imports/dependencies context
    if (element.imports && element.imports.length > 0) {
      parts.push(`Imports: ${element.imports.join(', ')}`);
    }
    
    // Add exports context
    if (element.exports && element.exports.length > 0) {
      parts.push(`Exports: ${element.exports.join(', ')}`);
    }
    
    // Add AI description
    if (aiDescription) {
      parts.push(`Description: ${aiDescription}`);
    }
    
    // Add semantic context about the element's purpose
    parts.push(this.generateSemanticContext(element));
    
    // Add README context
    const readmeContext = await this.readmeContextService.createContextualDescription(element.filePath);
    if (readmeContext) {
      parts.push(`Folder Context: ${readmeContext}`);
    }
    
    // Add a snippet of the actual code (first 500 chars)
    const codeSnippet = element.content.slice(0, 500);
    parts.push(`Code: ${codeSnippet}${element.content.length > 500 ? '...' : ''}`);
    
    return parts.join('\n\n');
  }

  /**
   * Generate semantic context for better search
   */
  private generateSemanticContext(element: ParsedCodeElement): string {
    const contexts: string[] = [];
    
    // Add context based on naming patterns
    const nameLower = element.name.toLowerCase();
    
    // Common patterns in function/method names
    if (element.type === 'function' || element.type === 'method') {
      if (nameLower.startsWith('get') || nameLower.startsWith('fetch')) {
        contexts.push('Retrieves or fetches data');
      } else if (nameLower.startsWith('set') || nameLower.startsWith('update')) {
        contexts.push('Updates or modifies data');
      } else if (nameLower.startsWith('create') || nameLower.startsWith('new')) {
        contexts.push('Creates new instances or resources');
      } else if (nameLower.startsWith('delete') || nameLower.startsWith('remove')) {
        contexts.push('Deletes or removes data');
      } else if (nameLower.startsWith('is') || nameLower.startsWith('has') || nameLower.startsWith('can')) {
        contexts.push('Checks conditions or permissions');
      } else if (nameLower.includes('handler') || nameLower.includes('listener')) {
        contexts.push('Event handler or listener');
      } else if (nameLower.includes('validate') || nameLower.includes('verify')) {
        contexts.push('Validation or verification logic');
      } else if (nameLower.includes('parse') || nameLower.includes('process')) {
        contexts.push('Data parsing or processing');
      } else if (nameLower.includes('render') || nameLower.includes('display')) {
        contexts.push('UI rendering or display logic');
      }
    }
    
    // Common patterns in class names
    if (element.type === 'class') {
      if (nameLower.includes('service')) {
        contexts.push('Service layer component');
      } else if (nameLower.includes('controller')) {
        contexts.push('Controller component');
      } else if (nameLower.includes('component')) {
        contexts.push('UI component');
      } else if (nameLower.includes('model')) {
        contexts.push('Data model or entity');
      } else if (nameLower.includes('manager')) {
        contexts.push('Resource manager');
      } else if (nameLower.includes('provider')) {
        contexts.push('Provider or factory');
      } else if (nameLower.includes('helper') || nameLower.includes('util')) {
        contexts.push('Helper or utility class');
      }
    }
    
    // Add file-based context
    const filePath = element.filePath.toLowerCase();
    if (filePath.includes('/api/') || filePath.includes('/routes/')) {
      contexts.push('API endpoint or route');
    } else if (filePath.includes('/components/')) {
      contexts.push('UI component');
    } else if (filePath.includes('/services/')) {
      contexts.push('Service layer');
    } else if (filePath.includes('/utils/') || filePath.includes('/helpers/')) {
      contexts.push('Utility or helper function');
    } else if (filePath.includes('/models/')) {
      contexts.push('Data model');
    } else if (filePath.includes('/tests/') || filePath.includes('.test.') || filePath.includes('.spec.')) {
      contexts.push('Test file');
    }
    
    return contexts.length > 0 ? `Context: ${contexts.join(', ')}` : '';
  }

  /**
   * Generate AI description for code element
   */
  private async generateAIDescription(element: ParsedCodeElement): Promise<string> {
    try {
      // Get default AI configuration from config.yaml
      const yamlPath = path.join(os.homedir(), '.labrats', 'config.yaml');
      let aiConfig: any = null;
      
      if (fs.existsSync(yamlPath)) {
        const yamlContent = fs.readFileSync(yamlPath, 'utf8');
        const fullConfig = yaml.load(yamlContent) as any;
        aiConfig = fullConfig?.ai;
      }
      
      if (!aiConfig?.defaultProvider || !aiConfig?.defaultModel) {
        throw new Error('No default AI provider configured');
      }

      const prompt = `Analyze this ${element.language} ${element.type} and provide a concise description of what it does, its purpose, and any important details. Be specific and technical.

${element.type}: ${element.name}
${element.jsdoc ? `Documentation: ${element.jsdoc}` : ''}
${element.parameters ? `Parameters: ${element.parameters.map(p => `${p.name}: ${p.type || 'any'}`).join(', ')}` : ''}
${element.returnType ? `Returns: ${element.returnType}` : ''}

Code:
${element.content.slice(0, 1000)}${element.content.length > 1000 ? '...' : ''}

Provide a clear, technical description in 2-3 sentences. Focus on:
1. What the ${element.type} does
2. Key inputs/outputs or side effects
3. Any important implementation details`;

      // Get API key from centralized service
      const apiKeyService = CentralizedAPIKeyService.getInstance();
      const apiKey = await apiKeyService.getAPIKey(aiConfig.defaultProvider);
      
      // For now, only support OpenAI for chat completions
      if (aiConfig.defaultProvider !== 'openai') {
        throw new Error(`Chat completion not implemented for provider: ${aiConfig.defaultProvider}`);
      }

      // Make direct API call using https
      const requestData = JSON.stringify({
        model: aiConfig.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates concise technical descriptions of code.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(requestData)
          }
        };

        const req = https.request(options, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode !== 200) {
                console.error('[CODE-VECTORIZATION] OpenAI API error:', res.statusCode, parsed);
                reject(new Error(`OpenAI API error: ${res.statusCode}`));
              } else {
                const content = parsed.choices?.[0]?.message?.content || '';
                resolve(content.trim());
              }
            } catch (e) {
              console.error('[CODE-VECTORIZATION] Failed to parse API response:', e);
              reject(e);
            }
          });
        });

        req.on('error', (error: any) => {
          console.error('[CODE-VECTORIZATION] Request error:', error);
          reject(error);
        });

        req.write(requestData);
        req.end();
      });
    } catch (error) {
      console.error('[CODE-VECTORIZATION] AI description generation failed:', error);
      throw error;
    }
  }

  /**
   * Get current git branch
   */
  private async getCurrentGitBranch(): Promise<string> {
    try {
      if (!this.projectPath) return 'unknown';
      
      const gitHeadPath = path.join(this.projectPath, '.git', 'HEAD');
      if (!fs.existsSync(gitHeadPath)) return 'unknown';
      
      const headContent = await fs.promises.readFile(gitHeadPath, 'utf-8');
      const match = headContent.match(/ref: refs\/heads\/(.+)/);
      return match ? match[1].trim() : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Pre-scan project to count total elements without vectorizing
   */
  async preScanProject(filePatterns: string[] = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/README.md', '**/readme.md']): Promise<PreScanResult> {
    if (!this.projectPath) {
      throw new Error('Project path not set');
    }

    console.log('[CODE-VECTORIZATION] Pre-scanning project...');
    
    const files = await this.findCodeFiles(this.projectPath, filePatterns);
    const result: PreScanResult = {
      totalFiles: files.length,
      totalElements: 0,
      fileTypes: {},
      elementTypes: {}
    };

    // Send scanning progress
    this.sendProgress({
      phase: 'scanning',
      current: 0,
      total: files.length,
      percentage: 0,
      currentFile: 'Pre-scanning files...',
      elementsProcessed: 0,
      totalElements: 0
    });

    let filesScanned = 0;
    for (const file of files) {
      try {
        const ext = path.extname(file).toLowerCase();
        result.fileTypes[ext] = (result.fileTypes[ext] || 0) + 1;

        const elements = await this.codeParser.parseFile(file);
        result.totalElements += elements.length;

        for (const element of elements) {
          result.elementTypes[element.type] = (result.elementTypes[element.type] || 0) + 1;
        }

        filesScanned++;
        
        // Update progress every 10 files to avoid too many updates
        if (filesScanned % 10 === 0 || filesScanned === files.length) {
          this.sendProgress({
            phase: 'scanning',
            current: filesScanned,
            total: files.length,
            percentage: Math.round((filesScanned / files.length) * 100),
            currentFile: `Pre-scanning: ${path.basename(file)}`,
            elementsProcessed: 0,
            totalElements: result.totalElements
          });
        }
      } catch (error) {
        console.error(`[CODE-VECTORIZATION] Failed to pre-scan ${file}:`, error);
      }
    }

    console.log(`[CODE-VECTORIZATION] Pre-scan complete: ${result.totalFiles} files, ${result.totalElements} elements`);
    
    // Store the pre-scan result for stats
    this.lastPreScanResult = result;
    
    return result;
  }

  /**
   * Vectorize all code files in the project (incremental - only changed files)
   */
  async vectorizeProject(filePatterns: string[] = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/README.md', '**/readme.md'], concurrency: number = 4): Promise<void> {
    if (!this.projectPath || !this.isReady()) {
      throw new Error('Service not initialized');
    }

    console.log(`[CODE-VECTORIZATION] Starting incremental project vectorization with ${concurrency} concurrent workers...`);
    this.isCurrentlyVectorizing = true;
    
    try {
      // First do a pre-scan to get total elements
      const preScan = await this.preScanProject(filePatterns);
      const totalElements = preScan.totalElements;
    
      // Get all matching files
      const files = await this.findCodeFiles(this.projectPath, filePatterns);
      console.log(`[CODE-VECTORIZATION] Found ${files.length} files with ${totalElements} total elements`);
      
      // Track statistics
      const stats = {
        filesChecked: 0,
        filesSkipped: 0,
        filesVectorized: 0,
        elementsProcessed: 0,
        errors: 0
      };
      
      // Send initial progress
      this.sendProgress({
        phase: 'processing',
        current: 0,
        total: totalElements,
        percentage: 0,
        currentFile: '',
        elementsProcessed: 0,
        totalElements
      });
      
      // Process files concurrently
      await this.processFilesConcurrently(files, totalElements, stats, concurrency);
      
      // Send completion progress
      this.sendProgress({
        phase: 'completed',
        current: totalElements,
        total: totalElements,
        percentage: 100,
        currentFile: '',
        elementsProcessed: stats.elementsProcessed,
        totalElements
      });
      
      console.log(`[CODE-VECTORIZATION] Incremental update complete:`);
      console.log(`[CODE-VECTORIZATION] - Files checked: ${stats.filesChecked}`);
      console.log(`[CODE-VECTORIZATION] - Files skipped (unchanged): ${stats.filesSkipped}`);
      console.log(`[CODE-VECTORIZATION] - Files vectorized (new/changed): ${stats.filesVectorized}`);
      console.log(`[CODE-VECTORIZATION] - Total elements processed: ${stats.elementsProcessed}`);
      console.log(`[CODE-VECTORIZATION] - Errors: ${stats.errors}`);
      
      // Save file hash cache to disk
      await this.saveFileHashCache();
      
      // Save vectorization state to disk
      await this.saveVectorizationState();
      
      this.isCurrentlyVectorizing = false;
    } catch (error) {
      this.isCurrentlyVectorizing = false;
      throw error;
    }
  }

  /**
   * Process files concurrently with controlled concurrency
   */
  private async processFilesConcurrently(
    files: string[],
    totalElements: number,
    stats: {
      filesChecked: number;
      filesSkipped: number;
      filesVectorized: number;
      elementsProcessed: number;
      errors: number;
    },
    concurrency: number
  ): Promise<void> {
    const semaphore = new Semaphore(concurrency);
    const promises: Promise<void>[] = [];
    
    for (const file of files) {
      const promise = semaphore.runExclusive(async () => {
        try {
          const relativePath = path.relative(this.projectPath!, file);
          
          // Vectorize file (will handle element-level changes internally)
          const docs = await this.vectorizeFile(file);
          
          // Count elements processed (from parsing for progress tracking)
          const elements = await this.codeParser.parseFile(file);
          
          // Update stats (thread-safe updates)
          stats.filesChecked++;
          stats.elementsProcessed += elements.length;
          
          // File was processed (may have had some changes or not)
          if (docs.length > 0) {
            stats.filesVectorized++;
          }
          
          // Send progress update
          this.sendProgress({
            phase: 'processing',
            current: stats.elementsProcessed,
            total: totalElements,
            percentage: Math.round((stats.elementsProcessed / totalElements) * 100),
            currentFile: relativePath,
            elementsProcessed: stats.elementsProcessed,
            totalElements
          });
          
        } catch (error) {
          stats.errors++;
          console.error(`[CODE-VECTORIZATION] Failed to process ${file}:`, error);
        }
      });
      
      promises.push(promise);
    }
    
    // Wait for all files to be processed
    await Promise.all(promises);
  }
  
  /**
   * Find all code files matching patterns
   */
  private async findCodeFiles(rootPath: string, patterns: string[]): Promise<string[]> {
    const { glob } = await import('glob');
    const files: string[] = [];
    
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: rootPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**'],
      });
      files.push(...matches);
    }
    
    return [...new Set(files)]; // Remove duplicates
  }
  
  /**
   * Vectorize README files separately to provide project context
   */
  async vectorizeReadmeFiles(): Promise<void> {
    if (!this.projectPath || !this.isReady()) {
      return;
    }
    
    const readmeContexts = this.readmeContextService.getAllContexts();
    
    for (const context of readmeContexts) {
      try {
        await this.vectorizeReadmeFile(context);
      } catch (error) {
        console.error(`[CODE-VECTORIZATION] Failed to vectorize README ${context.filePath}:`, error);
      }
    }
  }
  
  /**
   * Vectorize a single README file
   */
  private async vectorizeReadmeFile(context: any): Promise<void> {
    const elementId = this.generateElementId(context.filePath, {
      type: 'function', // Use 'function' as generic type for documentation
      name: path.basename(context.filePath),
      startLine: 1,
      endLine: context.content.split('\n').length
    } as any);
    
    // Check if already vectorized
    const exists = await this.vectorStorage!.hasDocument(this.codeIndex!.id, elementId);
    if (exists) {
      return;
    }
    
    // Create embedding content for README
    const embeddingContent = [
      `Documentation: ${path.basename(context.filePath)}`,
      `Path: ${path.relative(this.projectPath!, context.filePath)}`,
      `Folder Coverage: ${context.coversFolders.join(', ')}`,
      `Summary: ${context.summary}`,
      `Content: ${context.content.slice(0, 1000)}${context.content.length > 1000 ? '...' : ''}`
    ].join('\n\n');
    
    // Generate embedding
    const embedding = await this.generateEmbedding(embeddingContent);
    
    // Get file stats
    const stats = await fs.promises.stat(context.filePath);
    const gitBranch = await this.getCurrentGitBranch();
    
    // Create vector document
    const vectorDoc: VectorDocument = {
      id: elementId,
      content: context.content,
      metadata: {
        type: 'code-documentation',
        filePath: context.filePath,
        fileHash: await this.calculateFileHash(context.filePath),
        language: 'markdown',
        lineStart: 1,
        lineEnd: context.content.split('\n').length,
        aiDescription: context.summary,
        lastModified: stats.mtime.toISOString(),
        gitBranch,
        codeType: 'function', // Use 'function' as generic type for documentation
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        readmeDepth: context.depth,
        coversFolders: context.coversFolders
      },
      embedding,
    };
    
    await this.vectorStorage!.addDocument(this.codeIndex!.id, vectorDoc);
    console.log(`[CODE-VECTORIZATION] Vectorized README: ${path.basename(context.filePath)}`);
  }

  /**
   * Get vectorization statistics
   */
  async getStats(): Promise<CodeVectorizationStats> {
    if (!this.isReady() || !this.codeIndex) {
      return {
        totalFiles: 0,
        vectorizedFiles: 0,
        totalElements: 0,
        vectorizedElements: 0,
        lastSync: null,
        indexId: null,
      };
    }

    // Count vectorized documents
    const docIds = await this.vectorStorage!.getDocumentIds(this.codeIndex.id);
    const vectorizedElements = docIds.length;
    
    // Count unique files
    const uniqueFiles = new Set<string>();
    for (const docId of docIds) {
      const doc = await this.vectorStorage!.getDocument(this.codeIndex.id, docId);
      if (doc?.metadata.filePath) {
        uniqueFiles.add(doc.metadata.filePath);
      }
    }
    
    // Count total files in project
    let totalFiles = 0;
    if (this.projectPath) {
      try {
        const filePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
        const files = await this.findCodeFiles(this.projectPath, filePatterns);
        totalFiles = files.length;
      } catch (error) {
        console.error('[CODE-VECTORIZATION] Failed to count project files:', error);
      }
    }
    
    // Get total elements - if we don't have a recent pre-scan, do a quick count
    let totalElements = this.lastPreScanResult?.totalElements || 0;
    if (totalElements === 0 && this.projectPath) {
      try {
        console.log('[CODE-VECTORIZATION] No pre-scan result, doing quick element count...');
        const quickScan = await this.preScanProject();
        totalElements = quickScan.totalElements;
      } catch (error) {
        console.error('[CODE-VECTORIZATION] Failed to get total elements:', error);
      }
    }
    
    // Ensure vectorized elements never exceed total elements
    const safeVectorizedElements = Math.min(vectorizedElements, totalElements);
    
    return {
      totalFiles,
      vectorizedFiles: uniqueFiles.size,
      totalElements,
      vectorizedElements: safeVectorizedElements,
      lastSync: this.codeIndex.metadata.updatedAt ? new Date(this.codeIndex.metadata.updatedAt) : null,
      indexId: this.codeIndex.id,
    };
  }

  /**
   * Search for code by natural language query
   */
  async searchCode(query: string, options: {
    limit?: number;
    type?: string;
    language?: string;
    minSimilarity?: number;
  } = {}): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    console.log(`[CODE-VECTORIZATION] searchCode called with query: "${query}"`);
    
    if (!this.isReady()) {
      console.log('[CODE-VECTORIZATION] Service not ready!');
      console.log('[CODE-VECTORIZATION] vectorStorage:', !!this.vectorStorage);
      console.log('[CODE-VECTORIZATION] dexyService:', !!this.dexyService);
      console.log('[CODE-VECTORIZATION] codeIndex:', !!this.codeIndex);
      throw new Error('Service not initialized');
    }

    const { limit = 10, type, language, minSimilarity = 0.5 } = options;
    
    console.log(`[CODE-VECTORIZATION] Searching for: "${query}" with minSimilarity: ${minSimilarity}`);
    console.log(`[CODE-VECTORIZATION] Using index: ${this.codeIndex!.id}`);
    
    // Check index stats
    const stats = await this.getStats();
    console.log(`[CODE-VECTORIZATION] Index has ${stats.vectorizedElements} vectorized elements`);
    
    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);
    console.log(`[CODE-VECTORIZATION] Generated query embedding with ${queryEmbedding.length} dimensions`);
    
    // Search with filters
    const results = await this.vectorStorage!.searchSimilar(this.codeIndex!.id, queryEmbedding, {
      topK: limit,
      threshold: minSimilarity,
      filter: (doc) => {
        if (type && doc.metadata.codeType !== type) return false;
        if (language && doc.metadata.language !== language) return false;
        return true;
      },
    });
    
    console.log(`[CODE-VECTORIZATION] Search completed, found ${results.length} results`);
    return results;
  }

  /**
   * Find similar code to a given snippet
   */
  async findSimilarCode(codeSnippet: string, options: {
    limit?: number;
    minSimilarity?: number;
  } = {}): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    if (!this.isReady()) {
      throw new Error('Service not initialized');
    }

    const { limit = 10, minSimilarity = 0.8 } = options;
    
    // Generate embedding for code snippet
    const embedding = await this.generateEmbedding(codeSnippet);
    
    // Search for similar code
    const results = await this.vectorStorage!.searchSimilar(this.codeIndex!.id, embedding, {
      topK: limit,
      threshold: minSimilarity,
    });
    
    return results;
  }

  /**
   * Delete vectors for a file
   */
  async deleteFileVectors(filePath: string): Promise<void> {
    if (!this.isReady() || !this.codeIndex) {
      return;
    }

    const docIds = await this.vectorStorage!.getDocumentIds(this.codeIndex.id);
    
    for (const docId of docIds) {
      const doc = await this.vectorStorage!.getDocument(this.codeIndex.id, docId);
      if (doc?.metadata.filePath === filePath) {
        await this.vectorStorage!.deleteDocument(this.codeIndex.id, docId);
        console.log(`[CODE-VECTORIZATION] Deleted vector for: ${doc.metadata.name || docId}`);
      }
    }
    
    // Remove from file hash cache
    this.fileHashCache.delete(filePath);
    
    // Remove from vectorization state
    this.vectorizationState.delete(filePath);
    
    // Save both tracking files
    await this.saveFileHashCache();
    await this.saveVectorizationState();
  }

  /**
   * Get embedding dimensions for the current model
   */
  private async getEmbeddingDimensions(): Promise<number> {
    // Default dimensions for common embedding models
    const modelDimensions: { [key: string]: number } = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
      // Add more models as needed
    };

    const config = await this.dexyService?.getConfig();
    if (config?.modelId && modelDimensions[config.modelId]) {
      return modelDimensions[config.modelId];
    }

    // Default to 1536 (common dimension)
    return 1536;
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Use the dexy service's callEmbeddingAPI method
    if (!this.dexyService) {
      throw new Error('Dexy service not initialized');
    }

    // Check if Dexy is ready
    if (!this.dexyService.isReady()) {
      throw new Error('Dexy service is not ready. Please configure Dexy with a provider and embedding model.');
    }

    try {
      console.log('[CODE-VECTORIZATION] Generating embedding for text of length:', text.length);
      
      // Call the private method through reflection (temporary solution)
      const embedding = await (this.dexyService as any).callEmbeddingAPI(text);
      
      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate embedding - empty response from Dexy');
      }

      console.log('[CODE-VECTORIZATION] Successfully generated embedding with', embedding.length, 'dimensions');
      return embedding;
    } catch (error) {
      console.error('[CODE-VECTORIZATION] Failed to generate embedding:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send progress update to renderer
   */
  private sendProgress(progress: {
    phase: 'scanning' | 'processing' | 'completed';
    current: number;
    total: number;
    percentage: number;
    currentFile: string;
    elementsProcessed: number;
    totalElements?: number;
  }): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('code-vectorization:progress', progress);
    });
  }
}

// Export singleton instance
export const codeVectorizationService = CodeVectorizationService.getInstance();