import { ChatServiceMessage } from './chat-service';

export interface ChatHistoryEntry {
  id: string;
  projectPath: string;
  timestamp: Date;
  messages: ChatServiceMessage[];
}

export class ChatHistoryManagerRenderer {
  private static instance: ChatHistoryManagerRenderer;

  private constructor() {}

  static getInstance(): ChatHistoryManagerRenderer {
    if (!ChatHistoryManagerRenderer.instance) {
      ChatHistoryManagerRenderer.instance = new ChatHistoryManagerRenderer();
    }
    return ChatHistoryManagerRenderer.instance;
  }

  async saveChatHistory(projectPath: string, messages: ChatServiceMessage[]): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.chatHistory?.save) {
        const result = await window.electronAPI.chatHistory.save(projectPath, messages);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save chat history');
        }
        console.log(`[CHAT-HISTORY] Saved chat history for project: ${projectPath}`);
      } else {
        console.warn('[CHAT-HISTORY] ElectronAPI not available, cannot save chat history');
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to save chat history:`, error);
      throw error;
    }
  }

  async loadChatHistory(projectPath: string): Promise<ChatServiceMessage[]> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.chatHistory?.load) {
        const result = await window.electronAPI.chatHistory.load(projectPath);
        if (!result.success) {
          console.error(`[CHAT-HISTORY] Failed to load chat history: ${result.error}`);
          return [];
        }
        console.log(`[CHAT-HISTORY] Loaded chat history for project: ${projectPath}`);
        return result.messages || [];
      } else {
        console.warn('[CHAT-HISTORY] ElectronAPI not available, cannot load chat history');
        return [];
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to load chat history:`, error);
      return [];
    }
  }

  async clearChatHistory(projectPath: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.chatHistory?.clear) {
        const result = await window.electronAPI.chatHistory.clear(projectPath);
        if (!result.success) {
          throw new Error(result.error || 'Failed to clear chat history');
        }
        console.log(`[CHAT-HISTORY] Cleared chat history for project: ${projectPath}`);
      } else {
        console.warn('[CHAT-HISTORY] ElectronAPI not available, cannot clear chat history');
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to clear chat history:`, error);
      throw error;
    }
  }

  async cleanupOldHistories(projectPath: string, maxAge: number = 30): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.chatHistory?.cleanup) {
        const result = await window.electronAPI.chatHistory.cleanup(projectPath, maxAge);
        if (!result.success) {
          throw new Error(result.error || 'Failed to cleanup chat history');
        }
        console.log(`[CHAT-HISTORY] Cleaned up old history for project: ${projectPath}`);
      } else {
        console.warn('[CHAT-HISTORY] ElectronAPI not available, cannot cleanup chat history');
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to cleanup old history for project ${projectPath}:`, error);
      throw error;
    }
  }

  getHistoryDirectory(projectPath: string): string {
    // For renderer process, we can't access the actual directory
    // Return the expected path for informational purposes
    return `${projectPath}/.labrats/chats`;
  }

  getArchivesDirectory(projectPath: string): string {
    // For renderer process, we can't access the actual directory
    // Return the expected path for informational purposes
    return `${projectPath}/.labrats/chats/archives`;
  }
}

// Export singleton instance
export const chatHistoryManager = ChatHistoryManagerRenderer.getInstance();