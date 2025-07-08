import { ChatServiceMessage } from './chat-service';

export interface AppState {
  chat: {
    messages: ChatServiceMessage[];
    conversationHistory: ChatServiceMessage[];
  };
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
  private debounceTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  private getDefaultState(): AppState {
    return {
      chat: {
        messages: [],
        conversationHistory: []
      },
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
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
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

      // Use electron store to persist state
      if (window.electronAPI?.config?.set) {
        await window.electronAPI.config.set('projectStates', storageKey, projectState);
      }
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  private async loadState() {
    if (!this.currentProjectPath) return;

    try {
      const storageKey = await this.getStorageKey(this.currentProjectPath);
      
      if (window.electronAPI?.config?.get) {
        const projectState = await window.electronAPI.config.get('projectStates', storageKey) as ProjectState;
        
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

  // Chat state methods
  setChatMessages(messages: ChatServiceMessage[]) {
    this.currentState.chat.messages = messages;
    this.debounceStateUpdate();
  }

  getChatMessages(): ChatServiceMessage[] {
    return this.currentState.chat.messages;
  }

  setChatConversationHistory(history: ChatServiceMessage[]) {
    this.currentState.chat.conversationHistory = history;
    this.debounceStateUpdate();
  }

  getChatConversationHistory(): ChatServiceMessage[] {
    return this.currentState.chat.conversationHistory;
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
      if (window.electronAPI?.config?.set) {
        // Since delete doesn't exist, set to null to clear the state
        await window.electronAPI.config.set('projectStates', storageKey, null);
      }
    } catch (error) {
      console.error('Failed to clear project state:', error);
    }
  }

  async getAllProjectStates(): Promise<ProjectState[]> {
    try {
      if (window.electronAPI?.config?.get) {
        const allStates = await window.electronAPI.config.get('projectStates') as { [key: string]: ProjectState };
        return Object.values(allStates || {});
      }
    } catch (error) {
      console.error('Failed to get all project states:', error);
    }
    return [];
  }

  // Force immediate state save
  async forceSave() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.persistState();
  }
}

// Singleton instance
export const stateManager = StateManager.getInstance();