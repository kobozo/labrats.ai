import * as fs from 'fs';
import * as path from 'path';

export interface ChatServiceMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  providerId?: string;
  modelId?: string;
}

export interface ChatHistoryEntry {
  id: string;
  projectPath: string;
  timestamp: Date;
  messages: ChatServiceMessage[];
}

export class ChatHistoryManager {
  private static instance: ChatHistoryManager;

  private constructor() {
    // historyDir will be set per project, no global directory needed
  }

  static getInstance(): ChatHistoryManager {
    if (!ChatHistoryManager.instance) {
      ChatHistoryManager.instance = new ChatHistoryManager();
    }
    return ChatHistoryManager.instance;
  }

  private ensureProjectHistoryDirectory(projectPath: string): void {
    const historyDir = path.join(projectPath, '.labrats', 'chats');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
      console.log(`[CHAT-HISTORY] Created chat history directory: ${historyDir}`);
    }
  }

  private getProjectHistoryPath(projectPath: string): string {
    // Store chat history directly in the project's .labrats/chats directory
    this.ensureProjectHistoryDirectory(projectPath);
    return path.join(projectPath, '.labrats', 'chats', 'history.json');
  }

  private hashString(str: string): string {
    // Simple hash function for creating stable keys
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  async saveChatHistory(projectPath: string, messages: ChatServiceMessage[]): Promise<void> {
    try {
      const historyPath = this.getProjectHistoryPath(projectPath);
      const historyEntry: ChatHistoryEntry = {
        id: this.generateId(),
        projectPath,
        timestamp: new Date(),
        messages: messages.filter(msg => msg.content?.trim()) // Only save non-empty messages
      };

      await fs.promises.writeFile(
        historyPath,
        JSON.stringify(historyEntry, null, 2),
        'utf8'
      );
      
      console.log(`[CHAT-HISTORY] Saved chat history for project: ${projectPath}`);
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to save chat history:`, error);
    }
  }

  async loadChatHistory(projectPath: string): Promise<ChatServiceMessage[]> {
    try {
      const historyPath = this.getProjectHistoryPath(projectPath);
      
      if (!fs.existsSync(historyPath)) {
        return [];
      }

      const data = await fs.promises.readFile(historyPath, 'utf8');
      const historyEntry: ChatHistoryEntry = JSON.parse(data);
      
      console.log(`[CHAT-HISTORY] Loaded chat history for project: ${projectPath}`);
      return historyEntry.messages || [];
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to load chat history:`, error);
      return [];
    }
  }

  async clearChatHistory(projectPath: string): Promise<void> {
    try {
      const historyPath = this.getProjectHistoryPath(projectPath);
      
      if (fs.existsSync(historyPath)) {
        await fs.promises.unlink(historyPath);
        console.log(`[CHAT-HISTORY] Cleared chat history for project: ${projectPath}`);
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to clear chat history:`, error);
    }
  }

  async getAllProjectHistories(): Promise<string[]> {
    // This method is less relevant now since each project stores its own history
    // Return empty array for now, could be enhanced to scan multiple project paths
    console.warn(`[CHAT-HISTORY] getAllProjectHistories not implemented for per-project storage`);
    return [];
  }

  async cleanupOldHistories(projectPath: string, maxAge: number = 30): Promise<void> {
    try {
      const historyPath = this.getProjectHistoryPath(projectPath);
      
      if (fs.existsSync(historyPath)) {
        const stats = await fs.promises.stat(historyPath);
        const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // Convert days to ms
        const cutoff = new Date(Date.now() - maxAgeMs);

        if (stats.mtime < cutoff) {
          await fs.promises.unlink(historyPath);
          console.log(`[CHAT-HISTORY] Cleaned up old history: ${historyPath}`);
        }
      }
    } catch (error) {
      console.error(`[CHAT-HISTORY] Failed to cleanup old history for project ${projectPath}:`, error);
    }
  }

  private generateId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getHistoryDirectory(projectPath: string): string {
    return path.join(projectPath, '.labrats', 'chats');
  }
}

// Export singleton instance
export const chatHistoryManager = ChatHistoryManager.getInstance();