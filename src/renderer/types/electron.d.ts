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

export interface TerminalProcess {
  pid: number;
  cols: number;
  rows: number;
}

export interface TerminalAPI {
  create: (options: { cwd: string; cols: number; rows: number }) => Promise<TerminalProcess>;
  write: (pid: number, data: string) => Promise<void>;
  resize: (pid: number, cols: number, rows: number) => Promise<void>;
  kill: (pid: number) => Promise<void>;
  onData: (pid: number, callback: (data: string) => void) => void;
  onExit: (pid: number, callback: (code: number) => void) => void;
  checkIterm: () => Promise<boolean>;
}

export interface AIService {
  id: string;
  name: string;
  description: string;
  keyRequired: boolean;
  keyPlaceholder: string;
  docs?: string;
  enabled: boolean;
}

export interface ServiceConfig {
  id: string;
  enabled: boolean;
  hasApiKey: boolean;
}

export interface AIResult {
  success: boolean;
  error?: string;
}

export interface AIKeyResult extends AIResult {
  apiKey?: string;
}

export interface AIValidationResult {
  valid: boolean;
  error?: string;
}

export interface AITestResult {
  success: boolean;
  error?: string;
}

export interface AIAPI {
  isMasterKeySetup: () => Promise<boolean>;
  setupMasterKey: (masterKey: string) => Promise<AIResult>;
  generateMasterKey: () => Promise<string>;
  getSupportedServices: () => Promise<AIService[]>;
  getServiceConfig: (serviceId: string) => Promise<ServiceConfig>;
  storeAPIKey: (serviceId: string, apiKey: string) => Promise<AIResult>;
  getAPIKey: (serviceId: string) => Promise<AIKeyResult>;
  removeAPIKey: (serviceId: string) => Promise<AIResult>;
  setServiceEnabled: (serviceId: string, enabled: boolean) => Promise<AIResult>;
  validateAPIKey: (serviceId: string, apiKey: string) => Promise<AIValidationResult>;
  testAPIKey: (serviceId: string, apiKey: string) => Promise<AITestResult>;
  resetConfiguration: () => Promise<AIResult>;
}

export interface ElectronAPI {
  openFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  readDirectory: (dirPath: string) => Promise<FileNode[]>;
  readFile: (filePath: string) => Promise<string>;
  onFolderOpened: (callback: (folderPath: string) => void) => void;
  getRecentProjects: () => Promise<RecentProject[]>;
  removeRecentProject: (path: string) => Promise<RecentProject[]>;
  getEnv: (key: string) => Promise<string | undefined>;
  searchFiles: (rootPath: string, query: string, limit?: number) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkCommand: (command: string) => Promise<{ available: boolean }>;
  executeClaudeCommand: (request: any) => Promise<{ success: boolean; content?: string; error?: string; usage?: any }>;
  config: ConfigAPI;
  git: GitAPI;
  terminal?: TerminalAPI;
  ai?: AIAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}