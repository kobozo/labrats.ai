import { Tool } from '../types';
import { codeVectorizationService } from '../../code-vectorization-service-renderer';
import { codeVectorizationOrchestrator } from '../../code-vectorization-orchestrator-renderer';

export const codeExplorerTool: Tool = {
  name: 'explore_codebase',
  description: 'Explore and navigate the codebase structure. Get information about files, classes, functions, and their relationships.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The exploration action to perform',
        enum: ['list_files', 'list_functions', 'list_classes', 'get_file_structure', 'get_imports', 'get_exports']
      },
      filePath: {
        type: 'string',
        description: 'File path to explore (required for file-specific actions)',
        optional: true
      },
      pattern: {
        type: 'string',
        description: 'Filter pattern for listing (e.g., "*.ts" for TypeScript files)',
        optional: true
      },
      language: {
        type: 'string',
        description: 'Filter by programming language',
        optional: true
      }
    },
    required: ['action']
  }
};

export async function executeCodeExplorerTool(args: any): Promise<any> {
  try {
    // Check if service is ready
    const isReady = await codeVectorizationService.isReady();
    if (!isReady) {
      return {
        success: false,
        error: 'Code vectorization service is not initialized. Please ensure a project is open and vectorized.'
      };
    }

    switch (args.action) {
      case 'list_files':
        return await listFiles(args);
      
      case 'list_functions':
        return await listFunctions(args);
      
      case 'list_classes':
        return await listClasses(args);
      
      case 'get_file_structure':
        return await getFileStructure(args);
      
      case 'get_imports':
        return await getImports(args);
      
      case 'get_exports':
        return await getExports(args);
      
      default:
        return {
          success: false,
          error: `Unknown action: ${args.action}`
        };
    }
  } catch (error) {
    console.error('[CODE-EXPLORER-TOOL] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function listFiles(args: any): Promise<any> {
  // Search for file-level elements
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'function', // File-level elements are stored as 'function' type
    language: args.language
  });

  // Filter to only file-level elements and deduplicate
  const files = new Map<string, any>();
  
  results.forEach(result => {
    const metadata = result.document.metadata;
    if (metadata.filePath && metadata.lineStart === 1) {
      const filePath = metadata.filePath;
      if (!files.has(filePath) && (!args.pattern || matchesPattern(filePath, args.pattern))) {
        files.set(filePath, {
          path: filePath,
          language: metadata.language,
          imports: metadata.imports || [],
          exports: metadata.exports || [],
          lastModified: metadata.lastModified
        });
      }
    }
  });

  return {
    success: true,
    action: 'list_files',
    totalFiles: files.size,
    files: Array.from(files.values())
  };
}

async function listFunctions(args: any): Promise<any> {
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'function',
    language: args.language
  });

  const functions = results
    .filter(r => {
      const metadata = r.document.metadata;
      return metadata.functionName && 
             (!args.filePath || metadata.filePath === args.filePath);
    })
    .map(r => {
      const metadata = r.document.metadata;
      return {
        name: metadata.functionName,
        file: metadata.filePath,
        lines: `${metadata.lineStart}-${metadata.lineEnd}`,
        language: metadata.language,
        parameters: metadata.parameters,
        returnType: metadata.returnType,
        modifiers: metadata.modifiers,
        complexity: metadata.complexity,
        description: metadata.aiDescription
      };
    });

  return {
    success: true,
    action: 'list_functions',
    totalFunctions: functions.length,
    functions
  };
}

async function listClasses(args: any): Promise<any> {
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'class',
    language: args.language
  });

  const classes = results
    .filter(r => {
      const metadata = r.document.metadata;
      return metadata.className && 
             (!args.filePath || metadata.filePath === args.filePath);
    })
    .map(r => {
      const metadata = r.document.metadata;
      return {
        name: metadata.className,
        file: metadata.filePath,
        lines: `${metadata.lineStart}-${metadata.lineEnd}`,
        language: metadata.language,
        modifiers: metadata.modifiers,
        description: metadata.aiDescription
      };
    });

  // Also get interfaces
  const interfaceResults = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'interface',
    language: args.language
  });

  const interfaces = interfaceResults
    .filter(r => {
      const metadata = r.document.metadata;
      return (!args.filePath || metadata.filePath === args.filePath);
    })
    .map(r => {
      const metadata = r.document.metadata;
      return {
        name: metadata.name || 'Unknown',
        type: 'interface',
        file: metadata.filePath,
        lines: `${metadata.lineStart}-${metadata.lineEnd}`,
        language: metadata.language,
        description: metadata.aiDescription
      };
    });

  return {
    success: true,
    action: 'list_classes',
    totalClasses: classes.length,
    totalInterfaces: interfaces.length,
    classes,
    interfaces
  };
}

async function getFileStructure(args: any): Promise<any> {
  if (!args.filePath) {
    return {
      success: false,
      error: 'filePath is required for get_file_structure action'
    };
  }

  // Get all elements from the file
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000
  });

  const fileElements = results
    .filter(r => r.document.metadata.filePath === args.filePath)
    .map(r => {
      const metadata = r.document.metadata;
      return {
        type: metadata.codeType || metadata.type,
        name: metadata.functionName || metadata.className || metadata.name || 'Unknown',
        lines: `${metadata.lineStart}-${metadata.lineEnd}`,
        description: metadata.aiDescription,
        complexity: metadata.complexity
      };
    })
    .sort((a, b) => {
      const aStart = parseInt(a.lines.split('-')[0]);
      const bStart = parseInt(b.lines.split('-')[0]);
      return aStart - bStart;
    });

  return {
    success: true,
    action: 'get_file_structure',
    filePath: args.filePath,
    totalElements: fileElements.length,
    structure: fileElements
  };
}

async function getImports(args: any): Promise<any> {
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'import'
  });

  const imports = results
    .filter(r => !args.filePath || r.document.metadata.filePath === args.filePath)
    .map(r => {
      const metadata = r.document.metadata;
      return {
        import: metadata.name || r.document.content,
        file: metadata.filePath,
        line: metadata.lineStart
      };
    });

  return {
    success: true,
    action: 'get_imports',
    totalImports: imports.length,
    imports
  };
}

async function getExports(args: any): Promise<any> {
  const results = await codeVectorizationService.searchCode('', {
    limit: 1000,
    type: 'export'
  });

  const exports = results
    .filter(r => !args.filePath || r.document.metadata.filePath === args.filePath)
    .map(r => {
      const metadata = r.document.metadata;
      return {
        export: metadata.name || r.document.content,
        file: metadata.filePath,
        line: metadata.lineStart
      };
    });

  return {
    success: true,
    action: 'get_exports',
    totalExports: exports.length,
    exports
  };
}

function matchesPattern(filePath: string, pattern: string): boolean {
  // Simple pattern matching
  if (pattern.startsWith('*')) {
    return filePath.endsWith(pattern.substring(1));
  }
  return filePath.includes(pattern);
}