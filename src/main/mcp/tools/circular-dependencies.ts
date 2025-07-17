import { dependencyAnalysis } from '../../dependency-analysis-service';

export async function handleCircularDependencies(args: any): Promise<any> {
  const { includeDetails = true, maxCycles = 50 } = args;
  
  try {
    const result = await dependencyAnalysis.getCircularDependencies({
      includeDetails,
      maxCycles
    });
    
    if (result.count === 0) {
      return {
        message: '✅ No circular dependencies found! Your codebase has a clean dependency structure.',
        count: 0,
        cycles: [],
        severity: 'none'
      };
    }

    // Analyze overall severity
    let highSeverityCount = 0;
    let mediumSeverityCount = 0;
    let lowSeverityCount = 0;

    if (result.details) {
      result.details.forEach(detail => {
        switch (detail.severity) {
          case 'high': highSeverityCount++; break;
          case 'medium': mediumSeverityCount++; break;
          case 'low': lowSeverityCount++; break;
        }
      });
    }

    const overallSeverity = highSeverityCount > 0 ? 'high' : 
                          mediumSeverityCount > 0 ? 'medium' : 'low';

    const formattedResult: any = {
      message: `⚠️ Found ${result.count} circular dependency cycle${result.count > 1 ? 's' : ''}.`,
      count: result.count,
      severity: overallSeverity,
      breakdown: {
        high: highSeverityCount,
        medium: mediumSeverityCount,
        low: lowSeverityCount
      },
      cycles: result.cycles.map(cycle => ({
        files: cycle.map(filePath => ({
          path: filePath,
          name: filePath.split('/').pop() || filePath
        })),
        cycleLength: cycle.length,
        flowSummary: cycle.map(f => f.split('/').pop() || f).join(' → ') + 
                    ' → ' + (cycle[0].split('/').pop() || cycle[0])
      }))
    };

    if (includeDetails && result.details) {
      formattedResult.details = result.details.map(detail => ({
        ...detail,
        recommendations: getRecommendations(detail.severity, detail.cycle.length)
      }));
    }

    // Add recommendations for fixing
    formattedResult.recommendations = [
      '1. Identify the root cause: Look for unnecessary imports or tightly coupled modules',
      '2. Extract shared functionality: Move common code to separate modules',
      '3. Use dependency injection: Reduce direct dependencies between modules',
      '4. Refactor interfaces: Define clear contracts between modules',
      '5. Consider architectural patterns: Apply SOLID principles to break cycles'
    ];

    return formattedResult;
  } catch (error) {
    console.error('[MCP] Error getting circular dependencies:', error);
    throw new Error(`Failed to get circular dependencies: ${(error as Error).message}`);
  }
}

function getRecommendations(severity: string, cycleLength: number): string[] {
  const recommendations = [];
  
  if (severity === 'high') {
    recommendations.push('🚨 HIGH PRIORITY: This large cycle should be broken immediately');
    recommendations.push('Consider splitting into smaller, more focused modules');
  } else if (severity === 'medium') {
    recommendations.push('⚠️ MEDIUM PRIORITY: Review and refactor when possible');
  } else {
    recommendations.push('ℹ️ LOW PRIORITY: Monitor but not urgent');
  }

  if (cycleLength === 2) {
    recommendations.push('Two-file cycle: Consider merging files or extracting shared interface');
  } else if (cycleLength > 5) {
    recommendations.push('Large cycle: Break into smaller modules with clear responsibilities');
  }

  return recommendations;
}