import { dependencyAnalysis } from '../../dependency-analysis-service';

export async function handleDependencyImpact(args: any): Promise<any> {
  const { filePath, maxDepth = 5 } = args;
  
  if (!filePath) {
    throw new Error('filePath is required');
  }

  try {
    const directDependents = await dependencyAnalysis.getDependents(filePath);
    
    if (directDependents.length === 0) {
      return {
        file: filePath,
        impact: 'low',
        directDependents: 0,
        totalImpactedFiles: 0,
        message: 'No files depend on this file'
      };
    }

    // Find all files that depend on this file recursively
    const allImpactedFiles = new Set<string>();
    const visited = new Set<string>();
    
    const findTransitiveDependents = async (currentFile: string, depth: number): Promise<void> => {
      if (depth > maxDepth || visited.has(currentFile)) {
        return;
      }
      
      visited.add(currentFile);
      const dependents = await dependencyAnalysis.getDependents(currentFile);
      
      for (const dependent of dependents) {
        allImpactedFiles.add(dependent);
        await findTransitiveDependents(dependent, depth + 1);
      }
    };

    await findTransitiveDependents(filePath, 0);
    
    // Calculate impact level
    const totalImpacted = allImpactedFiles.size;
    let impactLevel: 'low' | 'medium' | 'high' | 'critical';
    
    if (totalImpacted === 0) {
      impactLevel = 'low';
    } else if (totalImpacted <= 3) {
      impactLevel = 'low';
    } else if (totalImpacted <= 10) {
      impactLevel = 'medium';
    } else if (totalImpacted <= 25) {
      impactLevel = 'high';
    } else {
      impactLevel = 'critical';
    }

    return {
      file: filePath,
      impact: impactLevel,
      directDependents: directDependents.length,
      totalImpactedFiles: totalImpacted,
      directDependentFiles: directDependents.map(dep => ({
        path: dep,
        name: dep.split('/').pop()
      })),
      allImpactedFiles: Array.from(allImpactedFiles).map(dep => ({
        path: dep,
        name: dep.split('/').pop()
      })),
      recommendations: getImpactRecommendations(impactLevel, totalImpacted)
    };
  } catch (error) {
    console.error('[MCP] Error analyzing dependency impact:', error);
    throw new Error(`Failed to analyze dependency impact: ${(error as Error).message}`);
  }
}

function getImpactRecommendations(impactLevel: string, totalImpacted: number): string[] {
  const recommendations: string[] = [];
  
  switch (impactLevel) {
    case 'low':
      recommendations.push('Changes to this file should have minimal impact');
      break;
    case 'medium':
      recommendations.push('Test dependent files after making changes');
      recommendations.push('Consider running focused tests for affected areas');
      break;
    case 'high':
      recommendations.push('Exercise caution when modifying this file');
      recommendations.push('Run comprehensive tests for all dependent files');
      recommendations.push('Consider creating a backup branch before changes');
      break;
    case 'critical':
      recommendations.push('CRITICAL: This file has extensive dependencies');
      recommendations.push('Thoroughly test all dependent functionality');
      recommendations.push('Consider gradual rollout of changes');
      recommendations.push('Review with team before making significant changes');
      break;
  }
  
  if (totalImpacted > 50) {
    recommendations.push('Consider refactoring to reduce coupling');
  }
  
  return recommendations;
}