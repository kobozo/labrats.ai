import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { CodeParserService } from './code-parser-service';
import { glob } from 'glob';
import { debounce } from 'lodash';

export interface DependencyNode {
  id: string; // file path
  name: string; // file name
  type: 'file';
  language: string;
  imports: string[]; // file paths this file imports
  exports: string[]; // exported symbols
  dependents: string[]; // files that import this file
}

export interface DependencyEdge {
  id: string;
  source: string; // file path
  target: string; // file path
  type: 'import' | 'export';
  symbols?: string[]; // imported/exported symbols
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  timestamp: Date;
}

export interface DependencyStats {
  totalFiles: number;
  totalDependencies: number;
  mostDependent: { file: string; count: number }[];
  mostDependedOn: { file: string; count: number }[];
  circularDependencies: string[][];
}

export class DependencyAnalysisService extends EventEmitter {
  private static instance: DependencyAnalysisService;
  private projectPath: string | null = null;
  private codeParser: CodeParserService;
  private dependencyGraph: DependencyGraph = {
    nodes: new Map(),
    edges: [],
    timestamp: new Date(),
  };
  private storageDir: string | null = null;
  private isAnalyzing: boolean = false;
  private saveDebounced: () => void;

  private readonly STORAGE_FILE = 'dependency-graph.json';
  private readonly STATS_FILE = 'dependency-stats.json';

  private constructor() {
    super();
    this.codeParser = CodeParserService.getInstance();
    
    // Debounce saving to avoid too many writes
    this.saveDebounced = debounce(() => this.saveToDisk(), 5000);
  }

  static getInstance(): DependencyAnalysisService {
    if (!DependencyAnalysisService.instance) {
      DependencyAnalysisService.instance = new DependencyAnalysisService();
    }
    return DependencyAnalysisService.instance;
  }

  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    this.storageDir = path.join(projectPath, '.labrats', 'dependencies');
    
    // Ensure storage directory exists
    await fs.mkdir(this.storageDir, { recursive: true });
    
    // Load existing data if available
    await this.loadFromDisk();
    
    this.emit('initialized');
  }

  async analyzeProject(patterns?: string[]): Promise<void> {
    if (!this.projectPath || this.isAnalyzing) {
      return;
    }

    this.isAnalyzing = true;
    this.emit('analysis:start');

    const defaultPatterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.py',
      '**/*.java',
      '**/*.go',
    ];

    const filePaths = await glob(patterns || defaultPatterns, {
      cwd: this.projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      absolute: true,
    });

    console.log(`[DEPENDENCY-ANALYSIS] Analyzing ${filePaths.length} files`);

    // Clear existing graph
    this.dependencyGraph = {
      nodes: new Map(),
      edges: [],
      timestamp: new Date(),
    };

    // First pass: Create nodes and collect imports
    for (const filePath of filePaths) {
      try {
        await this.analyzeFile(filePath);
        this.emit('file:analyzed', { filePath, total: filePaths.length });
      } catch (error) {
        console.error(`[DEPENDENCY-ANALYSIS] Failed to analyze ${filePath}:`, error);
      }
    }

    // Second pass: Resolve dependencies and create edges
    this.resolveDependencies();

    // Calculate stats
    const stats = this.calculateStats();
    await this.saveStats(stats);

    // Save to disk
    await this.saveToDisk();

    this.isAnalyzing = false;
    this.emit('analysis:complete', { stats });
  }

  private async analyzeFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf8');
    const language = this.getLanguageFromPath(filePath);
    const fileName = path.basename(filePath);

    // Parse imports and exports
    const imports = await this.extractImports(content, language, filePath);
    const exports = await this.extractExports(content, language);

    // Create node
    const node: DependencyNode = {
      id: filePath,
      name: fileName,
      type: 'file',
      language,
      imports,
      exports,
      dependents: [],
    };

    this.dependencyGraph.nodes.set(filePath, node);
  }

  private async extractImports(content: string, language: string, filePath: string): Promise<string[]> {
    const imports: string[] = [];
    const fileDir = path.dirname(filePath);

    if (language === 'typescript' || language === 'javascript') {
      // Extract ES6 imports
      const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
      const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const resolvedPath = await this.resolveImportPath(importPath, fileDir, language);
        if (resolvedPath) {
          imports.push(resolvedPath);
        }
      }

      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];
        const resolvedPath = await this.resolveImportPath(importPath, fileDir, language);
        if (resolvedPath) {
          imports.push(resolvedPath);
        }
      }
    } else if (language === 'python') {
      // Extract Python imports
      const importRegex = /(?:from\s+(\S+)\s+)?import\s+([^#\n]+)/g;
      
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const fromModule = match[1];
        if (fromModule && !fromModule.startsWith('.')) {
          continue; // Skip external modules
        }
        
        // Convert Python module path to file path
        if (fromModule) {
          const resolvedPath = await this.resolvePythonImport(fromModule, fileDir);
          if (resolvedPath) {
            imports.push(resolvedPath);
          }
        }
      }
    }

    return imports;
  }

  private async extractExports(content: string, language: string): Promise<string[]> {
    const exports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Extract named exports
      const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
      const defaultExportRegex = /export\s+default\s+(?:class|function)?\s*(\w+)?/g;
      
      let match;
      while ((match = namedExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      
      while ((match = defaultExportRegex.exec(content)) !== null) {
        exports.push(match[1] || 'default');
      }
    } else if (language === 'python') {
      // Extract Python exports (class and function definitions at module level)
      const classRegex = /^class\s+(\w+)/gm;
      const functionRegex = /^def\s+(\w+)/gm;
      
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      
      while ((match = functionRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    return exports;
  }

  private async resolveImportPath(importPath: string, fromDir: string, language: string): Promise<string | null> {
    // Skip external modules
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    // Resolve relative imports
    let resolvedPath = path.resolve(fromDir, importPath);

    // Try with different extensions
    const extensions = language === 'typescript' ? ['.ts', '.tsx', '.js', '.jsx'] : ['.js', '.jsx'];
    
    // Check if file exists as-is
    try {
      await fs.access(resolvedPath);
      return resolvedPath;
    } catch {}

    // Try with extensions
    for (const ext of extensions) {
      try {
        const pathWithExt = resolvedPath + ext;
        await fs.access(pathWithExt);
        return pathWithExt;
      } catch {}
    }

    // Try index file
    for (const ext of extensions) {
      try {
        const indexPath = path.join(resolvedPath, `index${ext}`);
        await fs.access(indexPath);
        return indexPath;
      } catch {}
    }

    return null;
  }

  private async resolvePythonImport(modulePath: string, fromDir: string): Promise<string | null> {
    // Convert relative module path to file path
    const parts = modulePath.split('.');
    const filePath = path.join(fromDir, ...parts) + '.py';
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try __init__.py
      const initPath = path.join(fromDir, ...parts, '__init__.py');
      try {
        await fs.access(initPath);
        return initPath;
      } catch {
        return null;
      }
    }
  }

  private resolveDependencies(): void {
    // Build dependency relationships and create edges
    for (const [filePath, node] of this.dependencyGraph.nodes) {
      for (const importPath of node.imports) {
        const targetNode = this.dependencyGraph.nodes.get(importPath);
        if (targetNode) {
          // Add this file as a dependent of the imported file
          targetNode.dependents.push(filePath);
          
          // Create edge
          const edge: DependencyEdge = {
            id: `${filePath}->${importPath}`,
            source: filePath,
            target: importPath,
            type: 'import',
          };
          
          this.dependencyGraph.edges.push(edge);
        }
      }
    }
  }

  private calculateStats(): DependencyStats {
    const nodes = Array.from(this.dependencyGraph.nodes.values());
    
    // Calculate most dependent files (files with most imports)
    const mostDependent = nodes
      .map(node => ({ file: node.name, count: node.imports.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Calculate most depended on files (files with most dependents)
    const mostDependedOn = nodes
      .map(node => ({ file: node.name, count: node.dependents.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Find circular dependencies
    const circularDependencies = this.findCircularDependencies();

    return {
      totalFiles: nodes.length,
      totalDependencies: this.dependencyGraph.edges.length,
      mostDependent,
      mostDependedOn,
      circularDependencies,
    };
  }

  private findCircularDependencies(): string[][] {
    const circular: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (filePath: string, path: string[]): void => {
      visited.add(filePath);
      recursionStack.add(filePath);
      path.push(filePath);

      const node = this.dependencyGraph.nodes.get(filePath);
      if (node) {
        for (const importPath of node.imports) {
          if (!visited.has(importPath)) {
            dfs(importPath, [...path]);
          } else if (recursionStack.has(importPath)) {
            // Found circular dependency
            const cycleStart = path.indexOf(importPath);
            if (cycleStart !== -1) {
              const cycle = path.slice(cycleStart);
              cycle.push(importPath); // Complete the cycle
              circular.push(cycle);
            }
          }
        }
      }

      recursionStack.delete(filePath);
    };

    // Run DFS from each unvisited node
    for (const filePath of this.dependencyGraph.nodes.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath, []);
      }
    }

    return circular;
  }

  async getDependencies(filePath: string): Promise<DependencyNode | null> {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(this.projectPath!, filePath);
    
    return this.dependencyGraph.nodes.get(absolutePath) || null;
  }

  async getDependents(filePath: string): Promise<string[]> {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.resolve(this.projectPath!, filePath);
    
    const node = this.dependencyGraph.nodes.get(absolutePath);
    return node ? node.dependents : [];
  }

  async findDependencyPath(from: string, to: string): Promise<string[] | null> {
    const fromPath = path.isAbsolute(from) ? from : path.resolve(this.projectPath!, from);
    const toPath = path.isAbsolute(to) ? to : path.resolve(this.projectPath!, to);

    // BFS to find shortest path
    const queue: { path: string[]; current: string }[] = [{ path: [fromPath], current: fromPath }];
    const visited = new Set<string>([fromPath]);

    while (queue.length > 0) {
      const { path, current } = queue.shift()!;
      
      if (current === toPath) {
        return path;
      }

      const node = this.dependencyGraph.nodes.get(current);
      if (node) {
        for (const importPath of node.imports) {
          if (!visited.has(importPath)) {
            visited.add(importPath);
            queue.push({ path: [...path, importPath], current: importPath });
          }
        }
      }
    }

    return null;
  }

  getGraph(): DependencyGraph {
    return this.dependencyGraph;
  }

  async getStats(): Promise<DependencyStats | null> {
    if (!this.storageDir) return null;
    
    try {
      const statsPath = path.join(this.storageDir, this.STATS_FILE);
      const content = await fs.readFile(statsPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return this.calculateStats();
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.storageDir) return;

    const data = {
      timestamp: this.dependencyGraph.timestamp,
      nodes: Array.from(this.dependencyGraph.nodes.entries()).map(([id, node]) => ({
        ...node,
        id,
      })),
      edges: this.dependencyGraph.edges,
    };

    const filePath = path.join(this.storageDir, this.STORAGE_FILE);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    this.emit('saved');
  }

  private async saveStats(stats: DependencyStats): Promise<void> {
    if (!this.storageDir) return;

    const filePath = path.join(this.storageDir, this.STATS_FILE);
    await fs.writeFile(filePath, JSON.stringify(stats, null, 2));
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.storageDir) return;

    try {
      const filePath = path.join(this.storageDir, this.STORAGE_FILE);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      // Reconstruct the graph
      this.dependencyGraph = {
        nodes: new Map(data.nodes.map((node: DependencyNode) => [node.id, node])),
        edges: data.edges,
        timestamp: new Date(data.timestamp),
      };

      this.emit('loaded');
    } catch (error) {
      console.log('[DEPENDENCY-ANALYSIS] No existing dependency data found');
    }
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: { [key: string]: string } = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
    };
    return langMap[ext] || 'unknown';
  }

  isReady(): boolean {
    return this.projectPath !== null && this.storageDir !== null;
  }

  updateFile(filePath: string): void {
    if (!this.isReady()) return;
    
    // Re-analyze the specific file
    this.analyzeFile(filePath).then(() => {
      this.resolveDependencies();
      this.saveDebounced();
    });
  }

  deleteFile(filePath: string): void {
    if (!this.isReady()) return;
    
    const node = this.dependencyGraph.nodes.get(filePath);
    if (node) {
      // Remove from dependents
      for (const dependent of node.dependents) {
        const depNode = this.dependencyGraph.nodes.get(dependent);
        if (depNode) {
          depNode.imports = depNode.imports.filter(imp => imp !== filePath);
        }
      }
      
      // Remove from imports
      for (const importPath of node.imports) {
        const impNode = this.dependencyGraph.nodes.get(importPath);
        if (impNode) {
          impNode.dependents = impNode.dependents.filter(dep => dep !== filePath);
        }
      }
      
      // Remove edges
      this.dependencyGraph.edges = this.dependencyGraph.edges.filter(
        edge => edge.source !== filePath && edge.target !== filePath
      );
      
      // Remove node
      this.dependencyGraph.nodes.delete(filePath);
      
      this.saveDebounced();
    }
  }
}

// Export singleton instance
export const dependencyAnalysis = DependencyAnalysisService.getInstance();