
export interface AppState {
  navigation: {
    activeView: string;
    previousView: string;
  };
  terminal: {
    sessions: any[];
    activeSessionId: string | null;
  };
  ui: {
    sidebarCollapsed: boolean;
    fileExplorerState: any;
    gitExplorerState: any;
  };
}

export interface ProjectState {
  projectPath: string;
  lastAccessed: Date;
  state: AppState;
}

export class StateManager {
  private static instance: StateManager;
  private currentProjectPath: string | null = null;
  private currentState: AppState = this.getDefaultState();
  private debounceTimer: number | null = null;

  private constructor() {}

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  private getDefaultState(): AppState {
    return {
      navigation: {
        activeView: 'chat',
        previousView: 'chat'
      },
      terminal: {
        sessions: [],
        activeSessionId: null
      },
      ui: {
        sidebarCollapsed: false,
        fileExplorerState: null,
        gitExplorerState: null
      }
    };
  }

  private async getStorageKey(projectPath: string): Promise<string> {
    // Create a stable key based on project path
    const pathHash = await this.hashString(projectPath);
    return `project_state_${pathHash}`;
  }

  private async hashString(str: string): Promise<string> {
    // Simple hash function for creating stable keys
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private debounceStateUpdate() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.persistState();
    }, 500); // Save state 500ms after last change
  }

  async setCurrentProject(projectPath: string | null) {
    // Save current state before switching
    if (this.currentProjectPath) {
      await this.persistState();
    }

    this.currentProjectPath = projectPath;
    
    if (projectPath) {
      // Migrate any existing project states from config.yaml on first load
      await this.migrateProjectStatesFromConfig();
      
      // Load state for the new project
      await this.loadState();
    } else {
      // Reset to default state when no project is open
      this.currentState = this.getDefaultState();
    }
  }

  getCurrentProject(): string | null {
    return this.currentProjectPath;
  }

  private async persistState() {
    if (!this.currentProjectPath) return;

    try {
      const storageKey = await this.getStorageKey(this.currentProjectPath);
      const projectState: ProjectState = {
        projectPath: this.currentProjectPath,
        lastAccessed: new Date(),
        state: this.currentState
      };

      // Use project state API to persist state
      if (window.electronAPI?.projectState?.set) {
        await window.electronAPI.projectState.set(storageKey, projectState);
      }
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  private async loadState() {
    if (!this.currentProjectPath) return;

    try {
      const storageKey = await this.getStorageKey(this.currentProjectPath);
      
      if (window.electronAPI?.projectState?.get) {
        const projectState = await window.electronAPI.projectState.get(storageKey) as ProjectState;
        
        if (projectState && projectState.state) {
          this.currentState = {
            ...this.getDefaultState(),
            ...projectState.state
          };
        } else {
          this.currentState = this.getDefaultState();
        }
      }
    } catch (error) {
      console.error('Failed to load state:', error);
      this.currentState = this.getDefaultState();
    }
  }


  // Navigation state methods
  setActiveView(view: string) {
    this.currentState.navigation.activeView = view;
    this.debounceStateUpdate();
  }

  getActiveView(): string {
    return this.currentState.navigation.activeView;
  }

  setPreviousView(view: string) {
    this.currentState.navigation.previousView = view;
    this.debounceStateUpdate();
  }

  getPreviousView(): string {
    return this.currentState.navigation.previousView;
  }

  // Terminal state methods
  setTerminalSessions(sessions: any[]) {
    this.currentState.terminal.sessions = sessions;
    this.debounceStateUpdate();
  }

  getTerminalSessions(): any[] {
    return this.currentState.terminal.sessions;
  }

  setActiveTerminalSession(sessionId: string | null) {
    this.currentState.terminal.activeSessionId = sessionId;
    this.debounceStateUpdate();
  }

  getActiveTerminalSession(): string | null {
    return this.currentState.terminal.activeSessionId;
  }

  // UI state methods
  setSidebarCollapsed(collapsed: boolean) {
    this.currentState.ui.sidebarCollapsed = collapsed;
    this.debounceStateUpdate();
  }

  getSidebarCollapsed(): boolean {
    return this.currentState.ui.sidebarCollapsed;
  }

  setFileExplorerState(state: any) {
    this.currentState.ui.fileExplorerState = state;
    this.debounceStateUpdate();
  }

  getFileExplorerState(): any {
    return this.currentState.ui.fileExplorerState;
  }

  setGitExplorerState(state: any) {
    this.currentState.ui.gitExplorerState = state;
    this.debounceStateUpdate();
  }

  getGitExplorerState(): any {
    return this.currentState.ui.gitExplorerState;
  }

  // Utility methods
  async clearProjectState(projectPath: string) {
    try {
      const storageKey = await this.getStorageKey(projectPath);
      if (window.electronAPI?.projectState?.set) {
        // Set to null to clear the state
        await window.electronAPI.projectState.set(storageKey, null);
      }
    } catch (error) {
      console.error('Failed to clear project state:', error);
    }
  }

  async getAllProjectStates(): Promise<ProjectState[]> {
    try {
      if (window.electronAPI?.projectState?.getAll) {
        return await window.electronAPI.projectState.getAll();
      }
    } catch (error) {
      console.error('Failed to get all project states:', error);
    }
    return [];
  }

  // Force immediate state save
  async forceSave() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.persistState();
  }

  // Migration method to move project states from config.yaml to projects.json
  private async migrateProjectStatesFromConfig() {
    try {
      // Check if migration is needed (only run once)
      if (window.electronAPI?.config?.get && window.electronAPI?.projectState?.set) {
        const configProjectStates = await window.electronAPI.config.get('projectStates') as { [key: string]: ProjectState };
        
        if (configProjectStates && Object.keys(configProjectStates).length > 0) {
          console.log('Migrating project states from config.yaml to projects.json...');
          
          // Migrate each project state
          for (const [key, projectState] of Object.entries(configProjectStates)) {
            await window.electronAPI.projectState.set(key, projectState);
          }
          
          // Clear the project states from config.yaml after successful migration
          await window.electronAPI.config.set('projectStates', null);
          
          console.log('Project states migration completed successfully');
        }
      }
    } catch (error) {
      console.error('Failed to migrate project states from config:', error);
    }
  }
}

// Singleton instance
export const stateManager = StateManager.getInstance();