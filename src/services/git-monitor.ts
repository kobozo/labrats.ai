import { GitStatus } from '../renderer/types/electron';

export interface GitBranches {
  current: string;
  all: string[];
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitMonitorState {
  status: GitStatus | null;
  branches: GitBranches;
  commitHistory: GitCommitInfo[];
  stashList: string[];
  isLoading: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

type GitMonitorListener = (state: GitMonitorState) => void;

export class GitMonitor {
  private static instance: GitMonitor;
  private listeners: Set<GitMonitorListener> = new Set();
  private state: GitMonitorState = {
    status: null,
    branches: { current: '', all: [] },
    commitHistory: [],
    stashList: [],
    isLoading: false,
    lastUpdated: null,
    error: null
  };
  private currentFolder: string | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private isUpdating = false;

  private constructor() {}

  static getInstance(): GitMonitor {
    if (!GitMonitor.instance) {
      GitMonitor.instance = new GitMonitor();
    }
    return GitMonitor.instance;
  }

  // Set the current project folder
  setCurrentFolder(folderPath: string | null) {
    if (this.currentFolder !== folderPath) {
      this.currentFolder = folderPath;
      
      // Clear previous state
      this.state = {
        status: null,
        branches: { current: '', all: [] },
        commitHistory: [],
        stashList: [],
        isLoading: false,
        lastUpdated: null,
        error: null
      };
      
      // Stop existing interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
      
      if (folderPath) {
        console.log('GitMonitor: Starting monitoring for folder:', folderPath);
        // Start monitoring immediately
        this.updateGitInfo();
        
        // Set up regular updates every 5 seconds
        this.updateInterval = setInterval(() => {
          this.updateGitInfo();
        }, 5000);
      }
      
      this.notifyListeners();
    }
  }

  // Subscribe to git state changes
  subscribe(listener: GitMonitorListener): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current state
    listener(this.state);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Get current state
  getState(): GitMonitorState {
    return { ...this.state };
  }


  // Force refresh commit history with more commits
  async loadMoreCommitHistory(count: number = 20): Promise<void> {
    if (!this.currentFolder) return;
    
    try {
      if (window.electronAPI?.git?.getCommitHistory) {
        const history = await window.electronAPI.git.getCommitHistory(count, this.currentFolder);
        this.state.commitHistory = history;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error loading more commit history:', error);
    }
  }

  // Force an immediate update
  async forceUpdate(): Promise<void> {
    if (this.currentFolder) {
      await this.updateGitInfo();
    }
  }

  // Deep equality check for objects
  private isEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Update git information
  private async updateGitInfo(): Promise<void> {
    if (!this.currentFolder || this.isUpdating) {
      return;
    }

    this.isUpdating = true;
    let hasChanges = false;
    
    try {
      // Keep previous state for comparison
      const previousState = { ...this.state };
      
      this.state.isLoading = true;
      this.state.error = null;

      // No need to wait anymore since we're passing folder path directly

      const [status, branches, commitHistory, stashList] = await Promise.allSettled([
        this.loadGitStatus(),
        this.loadBranches(),
        this.loadCommitHistory(),
        this.loadStashList()
      ]);

      // Update state with results only if they changed
      if (status.status === 'fulfilled') {
        if (!this.isEqual(this.state.status, status.value)) {
          this.state.status = status.value;
          hasChanges = true;
        }
      } else {
        console.warn('Failed to load git status:', status.reason);
      }

      if (branches.status === 'fulfilled') {
        if (!this.isEqual(this.state.branches, branches.value)) {
          this.state.branches = branches.value;
          hasChanges = true;
        }
      } else {
        console.warn('Failed to load branches:', branches.reason);
      }

      if (commitHistory.status === 'fulfilled') {
        if (!this.isEqual(this.state.commitHistory, commitHistory.value)) {
          this.state.commitHistory = commitHistory.value;
          hasChanges = true;
        }
      } else {
        console.warn('Failed to load commit history:', commitHistory.reason);
      }

      if (stashList.status === 'fulfilled') {
        if (!this.isEqual(this.state.stashList, stashList.value)) {
          this.state.stashList = stashList.value;
          hasChanges = true;
        }
      } else {
        console.warn('Failed to load stash list:', stashList.reason);
      }

      this.state.lastUpdated = new Date();
      this.state.error = null;
      
      // Only log if there were actual changes
      if (hasChanges) {
        console.log('GitMonitor: State updated with changes');
      }
    } catch (error) {
      console.error('Error updating git info:', error);
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      hasChanges = true; // Error state change should trigger update
    } finally {
      this.state.isLoading = false;
      this.isUpdating = false;
      
      // Always notify listeners to clear loading state, even if no data changes
      this.notifyListeners();
    }
  }

  private async loadGitStatus(): Promise<GitStatus | null> {
    if (!window.electronAPI?.git?.getStatus) {
      return null;
    }
    
    try {
      const status = await window.electronAPI.git.getStatus(this.currentFolder || undefined);
      return status;
    } catch (error) {
      // Silently handle non-git repositories or other errors
      console.debug('GitMonitor: Failed to load git status:', error);
      return null;
    }
  }

  private async loadBranches(): Promise<GitBranches> {
    if (!window.electronAPI?.git?.getBranches) {
      return { current: '', all: [] };
    }
    
    try {
      const branches = await window.electronAPI.git.getBranches(this.currentFolder || undefined);
      return branches;
    } catch (error) {
      console.debug('GitMonitor: Failed to load branches:', error);
      return { current: '', all: [] };
    }
  }

  private async loadCommitHistory(): Promise<GitCommitInfo[]> {
    if (!window.electronAPI?.git?.getCommitHistory) {
      return [];
    }
    
    try {
      return await window.electronAPI.git.getCommitHistory(20, this.currentFolder || undefined); // Get last 20 commits
    } catch (error) {
      // Silently handle non-git repositories or other errors
      return [];
    }
  }

  private async loadStashList(): Promise<string[]> {
    if (!window.electronAPI?.git?.stashList) {
      return [];
    }
    
    try {
      return await window.electronAPI.git.stashList(this.currentFolder || undefined);
    } catch (error) {
      // Silently handle non-git repositories or other errors
      return [];
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener({ ...this.state });
      } catch (error) {
        console.error('Error notifying git monitor listener:', error);
      }
    });
  }

  // Git operations that trigger immediate updates
  async stageFile(filePath: string): Promise<boolean> {
    if (!window.electronAPI?.git?.stageFile) return false;
    const result = await window.electronAPI.git.stageFile(filePath);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async unstageFile(filePath: string): Promise<boolean> {
    if (!window.electronAPI?.git?.unstageFile) return false;
    const result = await window.electronAPI.git.unstageFile(filePath);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async discardChanges(filePath: string): Promise<boolean> {
    if (!window.electronAPI?.git?.discardChanges) return false;
    const result = await window.electronAPI.git.discardChanges(filePath);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async commit(message: string): Promise<boolean> {
    if (!window.electronAPI?.git?.commit) return false;
    const result = await window.electronAPI.git.commit(message);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async switchBranch(branchName: string): Promise<boolean> {
    if (!window.electronAPI?.git?.switchBranch) return false;
    const result = await window.electronAPI.git.switchBranch(branchName);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async pull(): Promise<{ success: boolean; message: string }> {
    if (!window.electronAPI?.git?.pull) {
      return { success: false, message: 'Git pull not available' };
    }
    const result = await window.electronAPI.git.pull();
    if (result.success) {
      await this.forceUpdate();
    }
    return result;
  }

  async push(): Promise<{ success: boolean; message: string }> {
    if (!window.electronAPI?.git?.push) {
      return { success: false, message: 'Git push not available' };
    }
    const result = await window.electronAPI.git.push();
    if (result.success) {
      await this.forceUpdate();
    }
    return result;
  }

  async stashPush(message?: string): Promise<boolean> {
    if (!window.electronAPI?.git?.stashPush) return false;
    const result = await window.electronAPI.git.stashPush(message);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async stashPop(): Promise<boolean> {
    if (!window.electronAPI?.git?.stashPop) return false;
    const result = await window.electronAPI.git.stashPop();
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async revertFile(filePath: string): Promise<boolean> {
    if (!window.electronAPI?.git?.revertFile) return false;
    const result = await window.electronAPI.git.revertFile(filePath);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async stageAllFiles(): Promise<boolean> {
    if (!window.electronAPI?.git?.stageAllFiles) return false;
    const result = await window.electronAPI.git.stageAllFiles();
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async unstageAllFiles(): Promise<boolean> {
    if (!window.electronAPI?.git?.unstageAllFiles) return false;
    const result = await window.electronAPI.git.unstageAllFiles();
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async discardAllChanges(): Promise<boolean> {
    if (!window.electronAPI?.git?.discardAllChanges) return false;
    const result = await window.electronAPI.git.discardAllChanges();
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async resetSoft(commitHash?: string): Promise<boolean> {
    if (!window.electronAPI?.git?.resetSoft) return false;
    const result = await window.electronAPI.git.resetSoft(commitHash);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  async resetHard(commitHash?: string): Promise<boolean> {
    if (!window.electronAPI?.git?.resetHard) return false;
    const result = await window.electronAPI.git.resetHard(commitHash);
    if (result) {
      await this.forceUpdate();
    }
    return result;
  }

  // Cleanup
  dispose() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.listeners.clear();
    this.currentFolder = null;
  }
}

// Singleton instance
export const gitMonitor = GitMonitor.getInstance();