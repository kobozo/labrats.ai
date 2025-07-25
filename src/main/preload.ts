import { contextBridge, ipcRenderer } from 'electron';

// Polyfill for global object that some Node.js modules expect
(window as any).global = window;

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  getFileStats: (filePath: string) => ipcRenderer.invoke('get-file-stats', filePath),
  onFolderOpened: (callback: (folderPath: string) => void) => 
    ipcRenderer.on('folder-opened', (_event, folderPath) => callback(folderPath)),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  removeRecentProject: (path: string) => ipcRenderer.invoke('remove-recent-project', path),
  
  // Project state API
  projectState: {
    get: (key: string) => ipcRenderer.invoke('get-project-state', key),
    set: (key: string, value: any) => ipcRenderer.invoke('set-project-state', key, value),
    getAll: () => ipcRenderer.invoke('get-all-project-states'),
  },
  getEnv: (key: string) => ipcRenderer.invoke('get-env', key),
  searchFiles: (rootPath: string, query: string, limit?: number) => ipcRenderer.invoke('search-files', rootPath, query, limit),
  
  // Config API
  config: {
    get: (key?: string, property?: string) => ipcRenderer.invoke('get-config', key, property),
    set: (key: string, propertyOrValue: any, value?: any) => ipcRenderer.invoke('set-config', key, propertyOrValue, value),
    reset: () => ipcRenderer.invoke('reset-config'),
    getPath: () => ipcRenderer.invoke('get-config-path'),
    getConfigDir: () => ipcRenderer.invoke('get-config-dir'),
  },
  
  // Git API
  git: {
    getStatus: (folderPath?: string) => ipcRenderer.invoke('git-get-status', folderPath),
    getDiff: (filePath: string, staged?: boolean, folderPath?: string) => ipcRenderer.invoke('git-get-diff', filePath, staged, folderPath),
    stageFile: (filePath: string, folderPath?: string) => ipcRenderer.invoke('git-stage-file', filePath, folderPath),
    unstageFile: (filePath: string, folderPath?: string) => ipcRenderer.invoke('git-unstage-file', filePath, folderPath),
    discardChanges: (filePath: string) => ipcRenderer.invoke('git-discard-changes', filePath),
    commit: (message: string, folderPath?: string) => ipcRenderer.invoke('git-commit', message, folderPath),
    initialize: (repoPath: string) => ipcRenderer.invoke('git-initialize', repoPath),
    revertFile: (filePath: string) => ipcRenderer.invoke('git-revert-file', filePath),
    stashPush: (message?: string) => ipcRenderer.invoke('git-stash-push', message),
    stashPop: () => ipcRenderer.invoke('git-stash-pop'),
    stashList: (folderPath?: string) => ipcRenderer.invoke('git-stash-list', folderPath),
    resetSoft: (commitHash?: string) => ipcRenderer.invoke('git-reset-soft', commitHash),
    resetHard: (commitHash?: string) => ipcRenderer.invoke('git-reset-hard', commitHash),
    resetMixed: (commitHash?: string) => ipcRenderer.invoke('git-reset-mixed', commitHash),
    stageAllFiles: () => ipcRenderer.invoke('git-stage-all'),
    unstageAllFiles: () => ipcRenderer.invoke('git-unstage-all'),
    discardAllChanges: () => ipcRenderer.invoke('git-discard-all'),
    getBranches: (folderPath?: string) => ipcRenderer.invoke('git-get-branches', folderPath),
    createBranch: (branchName: string) => ipcRenderer.invoke('git-create-branch', branchName),
    switchBranch: (branchName: string) => ipcRenderer.invoke('git-switch-branch', branchName),
    deleteBranch: (branchName: string) => ipcRenderer.invoke('git-delete-branch', branchName),
    getCommitHistory: (count?: number, folderPath?: string) => ipcRenderer.invoke('git-get-commit-history', count, folderPath),
    cleanUntrackedFiles: () => ipcRenderer.invoke('git-clean-untracked'),
    pull: (folderPath?: string) => ipcRenderer.invoke('git-pull', folderPath),
    push: (folderPath?: string) => ipcRenderer.invoke('git-push', folderPath),
    fetch: () => ipcRenderer.invoke('git-fetch'),
  },
  
  // Terminal API
  terminal: {
    create: (options: { cwd: string; cols: number; rows: number }) => ipcRenderer.invoke('terminal-create', options),
    write: (pid: number, data: string) => ipcRenderer.invoke('terminal-write', pid, data),
    resize: (pid: number, cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', pid, cols, rows),
    kill: (pid: number) => ipcRenderer.invoke('terminal-kill', pid),
    onData: (pid: number, callback: (data: string) => void) => {
      const listener = (_event: any, terminalPid: number, data: string) => {
        if (terminalPid === pid) {
          callback(data);
        }
      };
      ipcRenderer.on('terminal-data', listener);
      return () => ipcRenderer.removeListener('terminal-data', listener);
    },
    onExit: (pid: number, callback: (code: number) => void) => {
      const listener = (_event: any, terminalPid: number, exitCode: number) => {
        if (terminalPid === pid) {
          callback(exitCode);
        }
      };
      ipcRenderer.on('terminal-exit', listener);
      return () => ipcRenderer.removeListener('terminal-exit', listener);
    },
    checkIterm: () => ipcRenderer.invoke('terminal-check-iterm'),
    openInIterm: (cwd: string) => ipcRenderer.invoke('terminal-open-iterm', cwd),
    changeCwd: (pid: number, newCwd: string) => ipcRenderer.invoke('terminal-change-cwd', pid, newCwd),
    getTitle: (pid: number) => ipcRenderer.invoke('terminal-get-title', pid),
    setTitle: (pid: number, title: string) => ipcRenderer.invoke('terminal-set-title', pid, title),
  },

  // AI Configuration API
  ai: {
    isMasterKeySetup: () => ipcRenderer.invoke('ai-is-master-key-setup'),
    setupMasterKey: (masterKey: string) => ipcRenderer.invoke('ai-setup-master-key', masterKey),
    generateMasterKey: () => ipcRenderer.invoke('ai-generate-master-key'),
    getSupportedServices: () => ipcRenderer.invoke('ai-get-supported-services'),
    getServiceConfig: (serviceId: string) => ipcRenderer.invoke('ai-get-service-config', serviceId),
    storeAPIKey: (serviceId: string, apiKey: string) => ipcRenderer.invoke('ai-store-api-key', serviceId, apiKey),
    getAPIKey: (serviceId: string) => ipcRenderer.invoke('ai-get-api-key', serviceId),
    removeAPIKey: (serviceId: string) => ipcRenderer.invoke('ai-remove-api-key', serviceId),
    setServiceEnabled: (serviceId: string, enabled: boolean) => ipcRenderer.invoke('ai-set-service-enabled', serviceId, enabled),
    validateAPIKey: (serviceId: string, apiKey: string) => ipcRenderer.invoke('ai-validate-api-key', serviceId, apiKey),
    testAPIKey: (serviceId: string, apiKey: string) => ipcRenderer.invoke('ai-test-api-key', serviceId, apiKey),
    resetConfiguration: () => ipcRenderer.invoke('ai-reset-configuration'),
    checkServiceOnline: (serviceId: string) => ipcRenderer.invoke('ai-check-service-online', serviceId),
    checkAllServicesOnline: () => ipcRenderer.invoke('ai-check-all-services-online'),
    getProviders: () => ipcRenderer.invoke('ai-get-providers'),
    getModels: (providerId: string) => ipcRenderer.invoke('ai-get-models', providerId),
    getAvailableProviders: () => ipcRenderer.invoke('ai-get-available-providers'),
  },

  // Prompt API
  prompt: {
    read: (agentId: string) => ipcRenderer.invoke('prompt-read', agentId),
    write: (agentId: string, content: string) => ipcRenderer.invoke('prompt-write', agentId, content),
    delete: (agentId: string) => ipcRenderer.invoke('prompt-delete', agentId),
    exists: (agentId: string) => ipcRenderer.invoke('prompt-exists', agentId),
    listCustom: () => ipcRenderer.invoke('prompt-list-custom'),
  },

  // Chat History API
  chatHistory: {
    save: (projectPath: string, messages: any[]) => ipcRenderer.invoke('chat-history-save', projectPath, messages),
    load: (projectPath: string) => ipcRenderer.invoke('chat-history-load', projectPath),
    clear: (projectPath: string) => ipcRenderer.invoke('chat-history-clear', projectPath),
    cleanup: (projectPath: string, maxAge?: number) => ipcRenderer.invoke('chat-history-cleanup', projectPath, maxAge),
  },

  // Kanban API
  kanban: {
    getBoard: (projectPath: string, boardId: string) => ipcRenderer.invoke('kanban:getBoard', projectPath, boardId),
    saveBoard: (projectPath: string, board: any) => ipcRenderer.invoke('kanban:saveBoard', projectPath, board),
    getTasks: (projectPath: string, boardId: string) => ipcRenderer.invoke('kanban:getTasks', projectPath, boardId),
    updateTask: (projectPath: string, boardId: string, task: any) => ipcRenderer.invoke('kanban:updateTask', projectPath, boardId, task),
    deleteTask: (projectPath: string, boardId: string, taskId: string) => ipcRenderer.invoke('kanban:deleteTask', projectPath, boardId, taskId),
    getEpics: (projectPath: string, boardId: string) => ipcRenderer.invoke('kanban:getEpics', projectPath, boardId),
    updateEpic: (projectPath: string, boardId: string, epic: any) => ipcRenderer.invoke('kanban:updateEpic', projectPath, boardId, epic),
    checkBranches: (projectPath: string) => ipcRenderer.invoke('kanban:checkBranches', projectPath),
  },

  // Dexy Vectorization API
  dexy: {
    initialize: (projectPath: string) => ipcRenderer.invoke('dexy:initialize', projectPath),
    isReady: () => ipcRenderer.invoke('dexy:isReady'),
    getConfig: () => ipcRenderer.invoke('dexy:getConfig'),
    vectorizeTask: (params: { task: any; boardId: string }) => ipcRenderer.invoke('dexy:vectorizeTask', params),
    updateTaskVector: (params: { task: any; boardId: string }) => ipcRenderer.invoke('dexy:updateTaskVector', params),
    deleteTaskVector: (taskId: string) => ipcRenderer.invoke('dexy:deleteTaskVector', taskId),
    findSimilarTasks: (params: { task: any; options?: any }) => ipcRenderer.invoke('dexy:findSimilarTasks', params),
    getIndices: () => ipcRenderer.invoke('dexy:getIndices'),
    syncTasks: (params: { tasks: any[]; boardId: string }) => ipcRenderer.invoke('dexy:syncTasks', params),
    hasTaskVector: (taskId: string) => ipcRenderer.invoke('dexy:hasTaskVector', taskId),
    getVectorizedTaskIds: () => ipcRenderer.invoke('dexy:getVectorizedTaskIds'),
  },

  // TODO Scanning API
  todo: {
    scanProject: (projectPath: string) => ipcRenderer.invoke('todo-scan-project', projectPath),
    scanNew: (projectPath: string) => ipcRenderer.invoke('todo-scan-new', projectPath),
    validate: (todoId: string, projectPath: string) => ipcRenderer.invoke('todo-validate', todoId, projectPath),
    getStats: (projectPath: string) => ipcRenderer.invoke('todo-get-stats', projectPath),
    createTasks: (projectPath: string, todoIds?: string[]) => ipcRenderer.invoke('todo-create-tasks', projectPath, todoIds),
    getMappings: (projectPath: string) => ipcRenderer.invoke('todo-get-mappings', projectPath),
    getMappingByTodo: (todoId: string, projectPath: string) => ipcRenderer.invoke('todo-get-mapping-by-todo', todoId, projectPath),
    getMappingByTask: (taskId: string, projectPath: string) => ipcRenderer.invoke('todo-get-mapping-by-task', taskId, projectPath),
    removeMapping: (todoId: string, projectPath: string) => ipcRenderer.invoke('todo-remove-mapping', todoId, projectPath),
    getSettings: (projectPath: string) => ipcRenderer.invoke('todo-get-settings', projectPath),
    updateSettings: (projectPath: string, settings: any) => ipcRenderer.invoke('todo-update-settings', projectPath, settings),
    cleanupInvalid: (projectPath: string) => ipcRenderer.invoke('todo-cleanup-invalid', projectPath),
    sync: (projectPath: string) => ipcRenderer.invoke('todo-sync', projectPath),
  },

  // System API
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  checkCommand: (command: string) => ipcRenderer.invoke('check-command', command),
  executeClaudeCommand: (request: any) => ipcRenderer.invoke('execute-claude-command', request),
  
  // Window management
  focusWindow: () => ipcRenderer.send('focus-window'),
  
  // Project path
  getProjectPath: () => ipcRenderer.invoke('get-project-path'),
  
  // MCP API
  mcp: {
    callTool: (toolName: string, args: any) => ipcRenderer.invoke('mcp:callTool', toolName, args),
    requestCommandApproval: (cmd: string, cwd: string) => ipcRenderer.invoke('mcp:requestCommandApproval', cmd, cwd),
    getAllowedCommands: () => ipcRenderer.invoke('mcp:getAllowedCommands'),
  },

  // Code Vectorization API
  codeVectorization: {
    initialize: (projectPath: string) => ipcRenderer.invoke('code-vectorization:initialize', projectPath),
    isReady: () => ipcRenderer.invoke('code-vectorization:isReady'),
    vectorizeFile: (filePath: string) => ipcRenderer.invoke('code-vectorization:vectorizeFile', filePath),
    vectorizeProject: (filePatterns?: string[]) => ipcRenderer.invoke('code-vectorization:vectorizeProject', filePatterns),
    getStats: () => ipcRenderer.invoke('code-vectorization:getStats'),
    searchCode: (query: string, options?: any) => ipcRenderer.invoke('code-vectorization:searchCode', query, options),
    findSimilarCode: (codeSnippet: string, options?: any) => ipcRenderer.invoke('code-vectorization:findSimilarCode', codeSnippet, options),
    deleteFileVectors: (filePath: string) => ipcRenderer.invoke('code-vectorization:deleteFileVectors', filePath),
    preScanProject: (filePatterns?: string[]) => ipcRenderer.invoke('code-vectorization:preScanProject', filePatterns),
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('code-vectorization:progress', (_event, progress) => callback(progress));
      return () => ipcRenderer.removeAllListeners('code-vectorization:progress');
    },
  },

  // Code Vectorization Orchestrator API
  codeOrchestrator: {
    initialize: (projectPath: string) => ipcRenderer.invoke('code-orchestrator:initialize', projectPath),
    vectorizeProject: (filePatterns?: string[], concurrency?: number) => ipcRenderer.invoke('code-orchestrator:vectorizeProject', filePatterns, concurrency),
    startWatching: () => ipcRenderer.invoke('code-orchestrator:startWatching'),
    stopWatching: () => ipcRenderer.invoke('code-orchestrator:stopWatching'),
    getStatus: () => ipcRenderer.invoke('code-orchestrator:getStatus'),
    forceReindex: () => ipcRenderer.invoke('code-orchestrator:forceReindex'),
    shutdown: () => ipcRenderer.invoke('code-orchestrator:shutdown'),
  },

  // Line Counter API
  lineCounter: {
    count: (projectPath: string) => ipcRenderer.invoke('line-counter:count', projectPath),
  },

  // AI Description API
  aiDescription: {
    getHumanReadable: (filePath: string) => ipcRenderer.invoke('ai-description:get-human-readable', filePath),
    getFileDescriptions: (filePath: string) => ipcRenderer.invoke('ai-description:get-file-descriptions', filePath),
    hasDescriptions: (filePath: string) => ipcRenderer.invoke('ai-description:has-descriptions', filePath),
    getFilesWithDescriptions: () => ipcRenderer.invoke('ai-description:get-files-with-descriptions'),
    getStats: () => ipcRenderer.invoke('ai-description:get-stats'),
  },

  // Dependency Analysis API
  dependencyAnalysis: {
    initialize: (projectPath: string) => ipcRenderer.invoke('dependency-analysis:initialize', projectPath),
    analyze: (patterns?: string[]) => ipcRenderer.invoke('dependency-analysis:analyze', patterns),
    getGraph: () => ipcRenderer.invoke('dependency-analysis:get-graph'),
    getDependencies: (filePath: string) => ipcRenderer.invoke('dependency-analysis:get-dependencies', filePath),
    getDependents: (filePath: string) => ipcRenderer.invoke('dependency-analysis:get-dependents', filePath),
    findPath: (from: string, to: string) => ipcRenderer.invoke('dependency-analysis:find-path', from, to),
    getStats: () => ipcRenderer.invoke('dependency-analysis:get-stats'),
  },

  // IPC Renderer for event listening
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => ipcRenderer.on(channel, listener),
    removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => ipcRenderer.removeListener(channel, listener),
  },
});