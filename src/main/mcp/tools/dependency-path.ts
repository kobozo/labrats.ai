import { dependencyAnalysis } from '../../dependency-analysis-service';

export async function handleDependencyPath(args: any): Promise<any> {
  const { fromFile, toFile } = args;
  
  if (!fromFile || !toFile) {
    throw new Error('Both fromFile and toFile are required');
  }

  try {
    const path = await dependencyAnalysis.findDependencyPath(fromFile, toFile);
    
    if (!path) {
      return {
        fromFile,
        toFile,
        connected: false,
        message: 'No dependency path found between these files'
      };
    }

    return {
      fromFile,
      toFile,
      connected: true,
      path: path.map(filePath => ({
        path: filePath,
        name: filePath.split('/').pop()
      })),
      pathLength: path.length,
      summary: `${fromFile.split('/').pop()} → ${path.slice(1, -1).map(f => f.split('/').pop()).join(' → ')} → ${toFile.split('/').pop()}`
    };
  } catch (error) {
    console.error('[MCP] Error finding dependency path:', error);
    throw new Error(`Failed to find dependency path: ${(error as Error).message}`);
  }
}