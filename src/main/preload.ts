import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  onFolderOpened: (callback: (folderPath: string) => void) => 
    ipcRenderer.on('folder-opened', (_event, folderPath) => callback(folderPath)),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  removeRecentProject: (path: string) => ipcRenderer.invoke('remove-recent-project', path),
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

  // System API
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  checkCommand: (command: string) => ipcRenderer.invoke('check-command', command),
  executeClaudeCommand: (request: any) => ipcRenderer.invoke('execute-claude-command', request),
});