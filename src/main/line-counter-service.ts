import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export interface LineCountResult {
  totalLines: number;
  totalFiles: number;
  fileTypes: { [ext: string]: { files: number; lines: number } };
}

export class LineCounterService {
  private static instance: LineCounterService;

  private constructor() {}

  static getInstance(): LineCounterService {
    if (!LineCounterService.instance) {
      LineCounterService.instance = new LineCounterService();
    }
    return LineCounterService.instance;
  }

  /**
   * Count lines of code in a project
   */
  async countLinesOfCode(
    projectPath: string,
    excludePatterns: string[] = []
  ): Promise<LineCountResult> {
    console.log('[LINE-COUNTER] Starting line count for:', projectPath);
    console.log('[LINE-COUNTER] Exclude patterns:', excludePatterns);

    const result: LineCountResult = {
      totalLines: 0,
      totalFiles: 0,
      fileTypes: {}
    };

    try {
      // Common code file patterns
      const filePatterns = [
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
        '**/*.py', '**/*.java', '**/*.go', '**/*.rs',
        '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
        '**/*.cs', '**/*.php', '**/*.rb', '**/*.swift',
        '**/*.kt', '**/*.scala', '**/*.r', '**/*.m',
        '**/*.vue', '**/*.svelte', '**/*.json', '**/*.yaml',
        '**/*.yml', '**/*.xml', '**/*.html', '**/*.css',
        '**/*.scss', '**/*.sass', '**/*.less', '**/*.sql',
        '**/*.sh', '**/*.bash', '**/*.zsh', '**/*.fish',
        '**/*.ps1', '**/*.bat', '**/*.cmd', '**/*.dart',
        '**/*.lua', '**/*.vim', '**/*.el', '**/*.clj'
      ];

      // Convert exclude patterns to glob patterns and add common ones
      const ignorePatterns = [
        ...excludePatterns.map(pattern => 
          pattern.includes('*') ? pattern : `**/${pattern}/**`
        ),
        '**/dist/**', '**/build/**', '**/out/**', 
        '**/.git/**', '**/node_modules/**', '**/__pycache__/**'
      ];
      
      console.log(`[LINE-COUNTER] Using ignore patterns:`, ignorePatterns);
      
      // Get all matching files
      const files: string[] = [];
      for (const pattern of filePatterns) {
        const matches = await glob(pattern, {
          cwd: projectPath,
          absolute: true,
          ignore: ignorePatterns,
          dot: false
        });
        files.push(...matches);
      }

      // Remove duplicates
      const uniqueFiles = [...new Set(files)];
      console.log(`[LINE-COUNTER] Found ${uniqueFiles.length} files to count`);

      // Count lines in each file
      for (const file of uniqueFiles) {
        try {
          const content = await fs.promises.readFile(file, 'utf-8');
          const lines = content.split('\n').length;
          const ext = path.extname(file).toLowerCase() || '.unknown';

          result.totalLines += lines;
          result.totalFiles++;

          if (!result.fileTypes[ext]) {
            result.fileTypes[ext] = { files: 0, lines: 0 };
          }
          result.fileTypes[ext].files++;
          result.fileTypes[ext].lines += lines;
        } catch (error) {
          console.error(`[LINE-COUNTER] Failed to read file ${file}:`, error);
        }
      }

      console.log(`[LINE-COUNTER] Counted ${result.totalLines} lines in ${result.totalFiles} files`);
      return result;
    } catch (error) {
      console.error('[LINE-COUNTER] Failed to count lines:', error);
      throw error;
    }
  }

  /**
   * Format lines of code number for display
   */
  formatLineCount(lines: number): string {
    if (lines >= 1000000) {
      return `${(lines / 1000000).toFixed(1)}M`;
    } else if (lines >= 1000) {
      return `${(lines / 1000).toFixed(1)}K`;
    }
    return lines.toString();
  }
}

// Export singleton instance
export const lineCounterService = LineCounterService.getInstance();