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
  
  // Config API
  config: {
    get: (key?: string, property?: string) => ipcRenderer.invoke('get-config', key, property),
    set: (key: string, propertyOrValue: any, value?: any) => ipcRenderer.invoke('set-config', key, propertyOrValue, value),
    reset: () => ipcRenderer.invoke('reset-config'),
    getPath: () => ipcRenderer.invoke('get-config-path'),
  },
  
  // Git API
  git: {
    getStatus: () => ipcRenderer.invoke('git-get-status'),
    getDiff: (filePath: string, staged?: boolean) => ipcRenderer.invoke('git-get-diff', filePath, staged),
    stageFile: (filePath: string) => ipcRenderer.invoke('git-stage-file', filePath),
    unstageFile: (filePath: string) => ipcRenderer.invoke('git-unstage-file', filePath),
    discardChanges: (filePath: string) => ipcRenderer.invoke('git-discard-changes', filePath),
    commit: (message: string) => ipcRenderer.invoke('git-commit', message),
    initialize: (repoPath: string) => ipcRenderer.invoke('git-initialize', repoPath),
  },
});