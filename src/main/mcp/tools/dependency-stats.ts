import { dependencyAnalysis } from '../../dependency-analysis-service';

export async function handleDependencyStats(args: any): Promise<any> {
  const { includeCircular = true, topCount = 10 } = args;
  
  try {
    const stats = await dependencyAnalysis.getStats();
    
    if (!stats) {
      return {
        message: 'No dependency statistics available. Run dependency analysis first.',
        available: false
      };
    }

    const result: any = {
      available: true,
      overview: {
        totalFiles: stats.totalFiles,
        totalDependencies: stats.totalDependencies,
        circularDependencyCount: stats.circularDependencies.length
      },
      mostDependent: stats.mostDependent.slice(0, topCount).map(item => ({
        file: item.file,
        path: item.file, // Keep full path for reference
        imports: item.count
      })),
      mostDependedOn: stats.mostDependedOn.slice(0, topCount).map(item => ({
        file: item.file,
        path: item.file, // Keep full path for reference
        dependents: item.count
      }))
    };

    if (includeCircular && stats.circularDependencies.length > 0) {
      result.circularDependencies = stats.circularDependencies.map(cycle => ({
        files: cycle.map(filePath => ({
          path: filePath,
          name: filePath.split('/').pop()
        })),
        cycleLength: cycle.length,
        summary: cycle.map(f => f.split('/').pop()).join(' → ')
      }));
    }

    return result;
  } catch (error) {
    console.error('[MCP] Error getting dependency stats:', error);
    throw new Error(`Failed to get dependency stats: ${(error as Error).message}`);
  }
}