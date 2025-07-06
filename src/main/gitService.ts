import { simpleGit, SimpleGit, StatusResult, DiffResult } from 'simple-git';
import * as path from 'path';

export interface GitFileStatus {
  path: string;
  status: string; // 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '??' | etc.
  staged: boolean;
  modified: boolean;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
}

export interface GitStatus {
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  current: string;
  tracking: string | null;
  isClean: boolean;
}

export interface GitDiff {
  file: string;
  hunks: GitHunk[];
  isNew: boolean;
  isDeleted: boolean;
  oldPath?: string;
  newPath?: string;
}

export interface GitHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitLine[];
}

export interface GitLine {
  content: string;
  type: 'context' | 'addition' | 'deletion';
  oldLineNumber?: number;
  newLineNumber?: number;
}

export class GitService {
  private git: SimpleGit | null = null;
  private currentRepo: string | null = null;

  async initializeRepo(repoPath: string): Promise<boolean> {
    try {
      this.git = simpleGit(repoPath);
      
      // Check if it's a valid git repository or find the root
      const isRepo = await this.git.checkIsRepo();
      
      if (isRepo) {
        // Get the actual repository root
        try {
          const repoRoot = await this.git.revparse(['--show-toplevel']);
          this.currentRepo = repoRoot.trim();
          // Re-initialize with the actual repo root
          this.git = simpleGit(this.currentRepo);
          return true;
        } catch (rootError) {
          // If we can't get the root, use the provided path
          this.currentRepo = repoPath;
          return true;
        }
      } else {
        // Try to find git repo in parent directories
        let currentPath = repoPath;
        const maxDepth = 10; // Prevent infinite loops
        
        for (let i = 0; i < maxDepth; i++) {
          const parentPath = path.dirname(currentPath);
          if (parentPath === currentPath) break; // Reached root
          
          try {
            const parentGit = simpleGit(parentPath);
            const isParentRepo = await parentGit.checkIsRepo();
            
            if (isParentRepo) {
              this.git = parentGit;
              this.currentRepo = parentPath;
              return true;
            }
          } catch (e) {
            // Continue searching
          }
          
          currentPath = parentPath;
        }
        
        // No git repository found
        this.git = null;
        this.currentRepo = null;
        return false;
      }
    } catch (error) {
      console.error('Error initializing git repo:', error);
      this.git = null;
      this.currentRepo = null;
      return false;
    }
  }

  async getStatus(): Promise<GitStatus | null> {
    if (!this.git) return null;

    try {
      const status: StatusResult = await this.git.status();
      
      const files: GitFileStatus[] = [];
      
      // Process staged files
      status.staged.forEach(file => {
        files.push({
          path: file,
          status: this.getFileStatus(file, status),
          staged: true,
          modified: false,
          isNew: status.created.includes(file),
          isDeleted: status.deleted.includes(file),
          isRenamed: status.renamed.some(r => r.to === file)
        });
      });
      
      // Process modified files
      status.modified.forEach(file => {
        if (!files.find(f => f.path === file)) {
          files.push({
            path: file,
            status: 'M',
            staged: false,
            modified: true,
            isNew: false,
            isDeleted: false,
            isRenamed: false
          });
        }
      });
      
      // Process untracked files
      status.not_added.forEach(file => {
        files.push({
          path: file,
          status: '??',
          staged: false,
          modified: false,
          isNew: true,
          isDeleted: false,
          isRenamed: false
        });
      });
      
      // Process deleted files
      status.deleted.forEach(file => {
        if (!files.find(f => f.path === file)) {
          files.push({
            path: file,
            status: 'D',
            staged: false,
            modified: false,
            isNew: false,
            isDeleted: true,
            isRenamed: false
          });
        }
      });

      return {
        files,
        ahead: status.ahead,
        behind: status.behind,
        current: status.current || 'main',
        tracking: status.tracking,
        isClean: files.length === 0
      };
    } catch (error) {
      console.error('Error getting git status:', error);
      return null;
    }
  }

  async getDiff(filePath: string, staged: boolean = false): Promise<GitDiff | null> {
    if (!this.git) return null;

    try {
      const options = staged ? ['--cached'] : [];
      const diff = await this.git.diff([...options, '--', filePath]);
      
      if (!diff) return null;

      return this.parseDiff(diff, filePath);
    } catch (error) {
      console.error('Error getting diff:', error);
      return null;
    }
  }

  async stageFile(filePath: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.add(filePath);
      return true;
    } catch (error) {
      console.error('Error staging file:', error);
      return false;
    }
  }

  async unstageFile(filePath: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.reset(['HEAD', filePath]);
      return true;
    } catch (error) {
      console.error('Error unstaging file:', error);
      return false;
    }
  }

  async discardChanges(filePath: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.checkout(['--', filePath]);
      return true;
    } catch (error) {
      console.error('Error discarding changes:', error);
      return false;
    }
  }

  async commit(message: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.commit(message);
      return true;
    } catch (error) {
      console.error('Error committing:', error);
      return false;
    }
  }

  async revertFile(filePath: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.checkout(['HEAD', '--', filePath]);
      return true;
    } catch (error) {
      console.error('Error reverting file:', error);
      return false;
    }
  }

  async stashPush(message?: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      const args = ['push'];
      if (message) {
        args.push('-m', message);
      }
      await this.git.stash(args);
      return true;
    } catch (error) {
      console.error('Error stashing changes:', error);
      return false;
    }
  }

  async stashPop(): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.stash(['pop']);
      return true;
    } catch (error) {
      console.error('Error popping stash:', error);
      return false;
    }
  }

  async stashList(): Promise<string[]> {
    if (!this.git) return [];

    try {
      const result = await this.git.stashList();
      return result.all.map(stash => `${stash.hash}: ${stash.message}`);
    } catch (error) {
      console.error('Error getting stash list:', error);
      return [];
    }
  }

  async resetSoft(commitHash?: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.reset(['--soft', commitHash || 'HEAD~1']);
      return true;
    } catch (error) {
      console.error('Error soft resetting:', error);
      return false;
    }
  }

  async resetHard(commitHash?: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.reset(['--hard', commitHash || 'HEAD~1']);
      return true;
    } catch (error) {
      console.error('Error hard resetting:', error);
      return false;
    }
  }

  async resetMixed(commitHash?: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.reset(['--mixed', commitHash || 'HEAD~1']);
      return true;
    } catch (error) {
      console.error('Error mixed resetting:', error);
      return false;
    }
  }

  async stageAllFiles(): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.add('.');
      return true;
    } catch (error) {
      console.error('Error staging all files:', error);
      return false;
    }
  }

  async unstageAllFiles(): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.reset(['HEAD']);
      return true;
    } catch (error) {
      console.error('Error unstaging all files:', error);
      return false;
    }
  }

  async discardAllChanges(): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.checkout(['.']);
      return true;
    } catch (error) {
      console.error('Error discarding all changes:', error);
      return false;
    }
  }

  async getBranches(): Promise<{ current: string; all: string[] }> {
    if (!this.git) return { current: '', all: [] };

    try {
      const branches = await this.git.branchLocal();
      return {
        current: branches.current,
        all: branches.all
      };
    } catch (error) {
      console.error('Error getting branches:', error);
      return { current: '', all: [] };
    }
  }

  async createBranch(branchName: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.checkoutLocalBranch(branchName);
      return true;
    } catch (error) {
      console.error('Error creating branch:', error);
      return false;
    }
  }

  async switchBranch(branchName: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.checkout(branchName);
      return true;
    } catch (error) {
      console.error('Error switching branch:', error);
      return false;
    }
  }

  async deleteBranch(branchName: string): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.deleteLocalBranch(branchName);
      return true;
    } catch (error) {
      console.error('Error deleting branch:', error);
      return false;
    }
  }

  async getCommitHistory(count: number = 10): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
    if (!this.git) return [];

    try {
      const log = await this.git.log({ maxCount: count });
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date
      }));
    } catch (error) {
      console.error('Error getting commit history:', error);
      return [];
    }
  }

  private getFileStatus(file: string, status: StatusResult): string {
    if (status.created.includes(file)) return 'A';
    if (status.deleted.includes(file)) return 'D';
    if (status.modified.includes(file)) return 'M';
    if (status.renamed.some(r => r.to === file)) return 'R';
    return 'M';
  }

  private parseDiff(diffText: string, filePath: string): GitDiff {
    const lines = diffText.split('\n');
    const hunks: GitHunk[] = [];
    let currentHunk: GitHunk | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    let isNew = false;
    let isDeleted = false;
    let oldPath = filePath;
    let newPath = filePath;

    for (const line of lines) {
      // Parse header information
      if (line.startsWith('--- ')) {
        if (line.includes('/dev/null')) {
          isNew = true;
        } else {
          oldPath = line.substring(4);
        }
        continue;
      }
      
      if (line.startsWith('+++ ')) {
        if (line.includes('/dev/null')) {
          isDeleted = true;
        } else {
          newPath = line.substring(4);
        }
        continue;
      }

      // Parse hunk header
      if (line.startsWith('@@')) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          const oldStart = parseInt(match[1]);
          const oldLines = match[2] ? parseInt(match[2]) : 1;
          const newStart = parseInt(match[3]);
          const newLines = match[4] ? parseInt(match[4]) : 1;
          
          currentHunk = {
            oldStart,
            oldLines,
            newStart,
            newLines,
            lines: []
          };
          
          oldLineNum = oldStart;
          newLineNum = newStart;
        }
        continue;
      }

      // Parse diff lines
      if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
        const type = line.startsWith('+') ? 'addition' : 
                    line.startsWith('-') ? 'deletion' : 'context';
        
        const gitLine: GitLine = {
          content: line.substring(1),
          type,
          oldLineNumber: type !== 'addition' ? oldLineNum : undefined,
          newLineNumber: type !== 'deletion' ? newLineNum : undefined
        };
        
        currentHunk.lines.push(gitLine);
        
        if (type !== 'addition') oldLineNum++;
        if (type !== 'deletion') newLineNum++;
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return {
      file: filePath,
      hunks,
      isNew,
      isDeleted,
      oldPath,
      newPath
    };
  }

  isInitialized(): boolean {
    return this.git !== null;
  }

  getCurrentRepo(): string | null {
    return this.currentRepo;
  }

  async cleanUntrackedFiles(): Promise<boolean> {
    if (!this.git) return false;

    try {
      await this.git.clean('f', ['-d']);
      return true;
    } catch (error) {
      console.error('Error cleaning untracked files:', error);
      return false;
    }
  }

  async pull(): Promise<{ success: boolean; message: string }> {
    if (!this.git) return { success: false, message: 'Git not initialized' };

    try {
      const result = await this.git.pull();
      return { 
        success: true, 
        message: `Pull completed. ${result.summary.changes} files changed, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions.`
      };
    } catch (error) {
      console.error('Error pulling:', error);
      return { 
        success: false, 
        message: `Pull failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async push(): Promise<{ success: boolean; message: string }> {
    if (!this.git) return { success: false, message: 'Git not initialized' };

    try {
      const result = await this.git.push();
      return { 
        success: true, 
        message: 'Push completed successfully.'
      };
    } catch (error) {
      console.error('Error pushing:', error);
      return { 
        success: false, 
        message: `Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async fetch(): Promise<{ success: boolean; message: string }> {
    if (!this.git) return { success: false, message: 'Git not initialized' };

    try {
      await this.git.fetch();
      return { 
        success: true, 
        message: 'Fetch completed successfully.'
      };
    } catch (error) {
      console.error('Error fetching:', error);
      return { 
        success: false, 
        message: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}