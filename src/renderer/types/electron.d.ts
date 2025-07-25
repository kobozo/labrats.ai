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
  getConfigDir: () => Promise<string>;
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
  getStatus: (folderPath?: string) => Promise<GitStatus | null>;
  getDiff: (filePath: string, staged?: boolean, folderPath?: string) => Promise<GitDiff | null>;
  stageFile: (filePath: string, folderPath?: string) => Promise<boolean>;
  unstageFile: (filePath: string, folderPath?: string) => Promise<boolean>;
  discardChanges: (filePath: string) => Promise<boolean>;
  commit: (message: string, folderPath?: string) => Promise<boolean>;
  initialize: (repoPath: string) => Promise<boolean>;
  revertFile: (filePath: string) => Promise<boolean>;
  stashPush: (message?: string) => Promise<boolean>;
  stashPop: () => Promise<boolean>;
  stashList: (folderPath?: string) => Promise<string[]>;
  resetSoft: (commitHash?: string) => Promise<boolean>;
  resetHard: (commitHash?: string) => Promise<boolean>;
  resetMixed: (commitHash?: string) => Promise<boolean>;
  stageAllFiles: () => Promise<boolean>;
  unstageAllFiles: () => Promise<boolean>;
  discardAllChanges: () => Promise<boolean>;
  getBranches: (folderPath?: string) => Promise<{ current: string; all: string[] }>;
  createBranch: (branchName: string) => Promise<boolean>;
  switchBranch: (branchName: string) => Promise<boolean>;
  deleteBranch: (branchName: string) => Promise<boolean>;
  getCommitHistory: (count?: number, folderPath?: string) => Promise<Array<{ hash: string; message: string; author: string; date: string }>>;
  cleanUntrackedFiles: () => Promise<boolean>;
  pull: (folderPath?: string) => Promise<{ success: boolean; message: string }>;
  push: (folderPath?: string) => Promise<{ success: boolean; message: string }>;
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

export interface PromptAPI {
  read: (agentId: string) => Promise<string | null>;
  write: (agentId: string, content: string) => Promise<boolean>;
  delete: (agentId: string) => Promise<boolean>;
  exists: (agentId: string) => Promise<boolean>;
  listCustom: () => Promise<string[]>;
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
  checkServiceOnline: (serviceId: string) => Promise<boolean>;
  checkAllServicesOnline: () => Promise<void>;
  getProviders: () => Promise<any[]>;
  getAvailableProviders: () => Promise<any[]>;
  getModels: (providerId: string) => Promise<any[]>;
}

export interface ChatHistoryResult {
  success: boolean;
  error?: string;
  messages?: any[];
}

export interface ChatHistoryAPI {
  save: (projectPath: string, messages: any[]) => Promise<ChatHistoryResult>;
  load: (projectPath: string) => Promise<ChatHistoryResult>;
  clear: (projectPath: string) => Promise<ChatHistoryResult>;
  cleanup: (projectPath: string, maxAge?: number) => Promise<ChatHistoryResult>;
}

export interface KanbanAPI {
  getBoard: (projectPath: string, boardId: string) => Promise<any>;
  saveBoard: (projectPath: string, board: any) => Promise<{ success: boolean; error?: string }>;
  getTasks: (projectPath: string, boardId: string) => Promise<any[]>;
  updateTask: (projectPath: string, boardId: string, task: any) => Promise<{ success: boolean; error?: string }>;
  deleteTask: (projectPath: string, boardId: string, taskId: string) => Promise<{ success: boolean; error?: string }>;
  getEpics: (projectPath: string, boardId: string) => Promise<any[]>;
  updateEpic: (projectPath: string, boardId: string, epic: any) => Promise<{ success: boolean; error?: string }>;
  checkBranches: (projectPath: string) => Promise<string[]>;
}

export interface DexyAPI {
  initialize: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
  isReady: () => Promise<boolean>;
  getConfig: () => Promise<{ providerId: string; modelId: string; concurrency?: number } | null>;
  vectorizeTask: (params: { task: any; boardId: string }) => Promise<{ success: boolean; error?: string }>;
  updateTaskVector: (params: { task: any; boardId: string }) => Promise<{ success: boolean; error?: string }>;
  deleteTaskVector: (taskId: string) => Promise<{ success: boolean; error?: string }>;
  findSimilarTasks: (params: { task: any; options?: { topK?: number; threshold?: number; excludeTaskId?: string } }) => Promise<{ success: boolean; error?: string; results: Array<{ task: any; similarity: number }> }>;
  getIndices: () => Promise<{ success: boolean; error?: string; indices: any[] }>;
  syncTasks: (params: { tasks: any[]; boardId: string }) => Promise<{ success: boolean; error?: string }>;
  hasTaskVector: (taskId: string) => Promise<{ success: boolean; hasVector: boolean; error?: string }>;
  getVectorizedTaskIds: () => Promise<{ success: boolean; taskIds: string[]; error?: string }>;
}

export interface TodoAPI {
  scanProject: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  scanNew: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  validate: (todoId: string, projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getStats: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  createTasks: (projectPath: string, todoIds?: string[]) => Promise<{ success: boolean; data?: any; error?: string }>;
  getMappings: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getMappingByTodo: (todoId: string, projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getMappingByTask: (taskId: string, projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  removeMapping: (todoId: string, projectPath: string) => Promise<{ success: boolean; error?: string }>;
  getSettings: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  updateSettings: (projectPath: string, settings: any) => Promise<{ success: boolean; error?: string }>;
  cleanupInvalid: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  sync: (projectPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export interface ProjectStateAPI {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<boolean>;
  getAll: () => Promise<any[]>;
}

export interface ElectronAPI {
  openFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  readDirectory: (dirPath: string) => Promise<FileNode[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
  getFileStats: (filePath: string) => Promise<{ size: string; modifiedTime: string; isDirectory: boolean; isFile: boolean }>;
  onFolderOpened: (callback: (folderPath: string) => void) => void;
  getRecentProjects: () => Promise<RecentProject[]>;
  removeRecentProject: (path: string) => Promise<RecentProject[]>;
  projectState: ProjectStateAPI;
  getEnv: (key: string) => Promise<string | undefined>;
  searchFiles: (rootPath: string, query: string, limit?: number) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  checkCommand: (command: string) => Promise<{ available: boolean }>;
  executeClaudeCommand: (request: any) => Promise<{ success: boolean; content?: string; error?: string; usage?: any }>;
  focusWindow: () => void;
  getProjectPath: () => Promise<string>;
  config: ConfigAPI;
  git: GitAPI;
  terminal?: TerminalAPI;
  ai?: AIAPI;
  prompt?: PromptAPI;
  chatHistory?: ChatHistoryAPI;
  kanban?: KanbanAPI;
  dexy?: DexyAPI;
  todo?: TodoAPI;
  mcp?: McpAPI;
  codeVectorization?: CodeVectorizationAPI;
  codeOrchestrator?: CodeOrchestratorAPI;
  lineCounter?: LineCounterAPI;
  aiDescription?: AIDescriptionAPI;
  dependencyAnalysis?: DependencyAnalysisAPI;
  ipcRenderer?: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
  };
}

export interface McpAPI {
  callTool: (toolName: string, args: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  getStatus: () => Promise<{ ready: boolean; serverInfo?: { name: string; version: string } }>;
}

export interface CodeVectorizationProgress {
  phase: 'scanning' | 'processing' | 'completed';
  current: number;
  total: number;
  percentage: number;
  currentFile: string;
  elementsProcessed: number;
  totalElements?: number;
}

export interface PreScanResult {
  totalFiles: number;
  totalElements: number;
  fileTypes: { [ext: string]: number };
  elementTypes: { [type: string]: number };
}

export interface CodeVectorizationAPI {
  initialize: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
  isReady: () => Promise<boolean>;
  vectorizeFile: (filePath: string) => Promise<{ success: boolean; documents?: any[]; error?: string }>;
  vectorizeProject: (filePatterns?: string[]) => Promise<{ success: boolean; error?: string }>;
  getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>;
  searchCode: (query: string, options?: any) => Promise<{ success: boolean; results?: Array<{ document: any; similarity: number }>; error?: string }>;
  findSimilarCode: (codeSnippet: string, options?: any) => Promise<{ success: boolean; results?: Array<{ document: any; similarity: number }>; error?: string }>;
  deleteFileVectors: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  preScanProject: (filePatterns?: string[]) => Promise<{ success: boolean; result?: PreScanResult; error?: string }>;
  onProgress: (callback: (progress: CodeVectorizationProgress) => void) => () => void;
}

export interface CodeOrchestratorAPI {
  initialize: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
  vectorizeProject: (filePatterns?: string[], concurrency?: number) => Promise<{ success: boolean; error?: string }>;
  startWatching: () => Promise<{ success: boolean; error?: string }>;
  stopWatching: () => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<{ success: boolean; status?: any; error?: string }>;
  forceReindex: () => Promise<{ success: boolean; error?: string }>;
  shutdown: () => Promise<{ success: boolean; error?: string }>;
}

export interface LineCountResult {
  totalLines: number;
  totalFiles: number;
  fileTypes: { [ext: string]: { files: number; lines: number } };
  formattedTotal?: string;
}

export interface LineCounterAPI {
  count: (projectPath: string) => Promise<{ success: boolean; result?: LineCountResult; error?: string }>;
}

export interface AIDescriptionAPI {
  getHumanReadable: (filePath: string) => Promise<{ success: boolean; content?: string | null; error?: string }>;
  getFileDescriptions: (filePath: string) => Promise<{ success: boolean; descriptions?: any; error?: string }>;
  hasDescriptions: (filePath: string) => Promise<{ success: boolean; hasDescriptions?: boolean; error?: string }>;
  getFilesWithDescriptions: () => Promise<{ success: boolean; files?: string[]; error?: string }>;
  getStats: () => Promise<{ success: boolean; stats?: { totalFiles: number; totalElements: number }; error?: string }>;
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'file';
  language: string;
  imports: string[];
  exports: string[];
  dependents: string[];
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  type: 'import' | 'export';
  symbols?: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  timestamp: Date;
}

export interface DependencyStats {
  totalFiles: number;
  totalDependencies: number;
  mostDependent: { file: string; count: number }[];
  mostDependedOn: { file: string; count: number }[];
  circularDependencies: string[][];
}

export interface DependencyAnalysisAPI {
  initialize: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
  analyze: (patterns?: string[]) => Promise<{ success: boolean; error?: string }>;
  getGraph: () => Promise<DependencyGraph | null>;
  getDependencies: (filePath: string) => Promise<DependencyNode | null>;
  getDependents: (filePath: string) => Promise<string[]>;
  findPath: (from: string, to: string) => Promise<string[] | null>;
  getStats: () => Promise<DependencyStats | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}