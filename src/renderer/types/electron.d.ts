export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  lastModified: string;
  size: string | null;
  isExpanded: boolean;
  children?: FileNode[];
}

export interface RecentProject {
  path: string;
  lastOpened: string;
  name: string;
}

export interface ConfigAPI {
  get: (key?: string, property?: string) => Promise<any>;
  set: (key: string, propertyOrValue: any, value?: any) => Promise<void>;
  reset: () => Promise<void>;
  getPath: () => Promise<string>;
}

export interface GitFileStatus {
  path: string;
  status: string;
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

export interface GitLine {
  content: string;
  type: 'context' | 'addition' | 'deletion';
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface GitHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitLine[];
}

export interface GitDiff {
  file: string;
  hunks: GitHunk[];
  isNew: boolean;
  isDeleted: boolean;
  oldPath?: string;
  newPath?: string;
}

export interface GitAPI {
  getStatus: () => Promise<GitStatus | null>;
  getDiff: (filePath: string, staged?: boolean) => Promise<GitDiff | null>;
  stageFile: (filePath: string) => Promise<boolean>;
  unstageFile: (filePath: string) => Promise<boolean>;
  discardChanges: (filePath: string) => Promise<boolean>;
  commit: (message: string) => Promise<boolean>;
  initialize: (repoPath: string) => Promise<boolean>;
  revertFile: (filePath: string) => Promise<boolean>;
  stashPush: (message?: string) => Promise<boolean>;
  stashPop: () => Promise<boolean>;
  stashList: () => Promise<string[]>;
  resetSoft: (commitHash?: string) => Promise<boolean>;
  resetHard: (commitHash?: string) => Promise<boolean>;
  resetMixed: (commitHash?: string) => Promise<boolean>;
  stageAllFiles: () => Promise<boolean>;
  unstageAllFiles: () => Promise<boolean>;
  discardAllChanges: () => Promise<boolean>;
  getBranches: () => Promise<{ current: string; all: string[] }>;
  createBranch: (branchName: string) => Promise<boolean>;
  switchBranch: (branchName: string) => Promise<boolean>;
  deleteBranch: (branchName: string) => Promise<boolean>;
  getCommitHistory: (count?: number) => Promise<Array<{ hash: string; message: string; author: string; date: string }>>;
  cleanUntrackedFiles: () => Promise<boolean>;
  pull: () => Promise<{ success: boolean; message: string }>;
  push: () => Promise<{ success: boolean; message: string }>;
  fetch: () => Promise<{ success: boolean; message: string }>;
}

export interface ElectronAPI {
  openFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  readDirectory: (dirPath: string) => Promise<FileNode[]>;
  readFile: (filePath: string) => Promise<string>;
  onFolderOpened: (callback: (folderPath: string) => void) => void;
  getRecentProjects: () => Promise<RecentProject[]>;
  removeRecentProject: (path: string) => Promise<RecentProject[]>;
  getEnv: (key: string) => Promise<string | undefined>;
  config: ConfigAPI;
  git: GitAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}