import { dependencyAnalysis } from '../../dependency-analysis-service';

export async function handleDependencyQuery(args: any): Promise<any> {
  const { filePath } = args;
  
  if (!filePath) {
    throw new Error('filePath is required');
  }

  try {
    const node = await dependencyAnalysis.getDependencies(filePath);
    
    if (!node) {
      return {
        file: filePath,
        found: false,
        message: 'File not found in dependency graph'
      };
    }

    const dependents = await dependencyAnalysis.getDependents(filePath);

    return {
      file: filePath,
      found: true,
      language: node.language,
      summary: {
        imports: node.imports.length,
        exports: node.exports.length,
        dependents: dependents.length
      },
      dependencies: {
        imports: node.imports.map(imp => ({
          path: imp,
          name: imp.split('/').pop()
        })),
        exports: node.exports,
        dependents: dependents.map(dep => ({
          path: dep,
          name: dep.split('/').pop()
        }))
      }
    };
  } catch (error) {
    console.error('[MCP] Error querying dependencies:', error);
    throw new Error(`Failed to query dependencies: ${(error as Error).message}`);
  }
}