import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { getAIProviderManager } from './ai-provider-manager';
import { chatHistoryManager } from './chat-history-manager-renderer';

export interface LangChainChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  providerId?: string;
  modelId?: string;
  structuredResponse?: any; // For storing structured JSON responses from agents
}

export interface TokenUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export interface LangChainChatResponse {
  success: boolean;
  message?: LangChainChatMessage;
  error?: string;
  tokenUsage?: TokenUsage;
}

export class LangChainChatService {
  private providerManager = getAIProviderManager();
  private conversationHistory: LangChainChatMessage[] = [];
  private currentProjectPath: string | null = null;
  private sessionTokenUsage: TokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };

  async sendMessage(
    content: string,
    options: {
      providerId?: string;
      modelId?: string;
      agentId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<LangChainChatResponse> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      
      // Variable to capture token usage
      let tokenUsage: TokenUsage | undefined;
      
      // Create LangChain chat model based on provider with token tracking callback
      const chatModel = await this.createChatModel(providerId, modelId, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        callbacks: [{
          handleLLMEnd: (output) => {
            // Extract token usage from LLM output
            if (output.llmOutput?.tokenUsage) {
              tokenUsage = {
                completionTokens: output.llmOutput.tokenUsage.completionTokens || 0,
                promptTokens: output.llmOutput.tokenUsage.promptTokens || 0,
                totalTokens: output.llmOutput.tokenUsage.totalTokens || 0
              };
              
              // Update session totals
              this.sessionTokenUsage.completionTokens += tokenUsage.completionTokens;
              this.sessionTokenUsage.promptTokens += tokenUsage.promptTokens;
              this.sessionTokenUsage.totalTokens += tokenUsage.totalTokens;
              
              console.log(`[TOKEN-USAGE] Current request: ${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion = ${tokenUsage.totalTokens} total`);
              console.log(`[TOKEN-USAGE] Session total: ${this.sessionTokenUsage.totalTokens} tokens`);
            }
          }
        }]
      });

      // Build message history
      const messages: BaseMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === 'system') {
          messages.push(new SystemMessage(msg.content));
        }
      }

      // Add current user message
      messages.push(new HumanMessage(content));

      // Add current user message to history
      const userMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };
      this.conversationHistory.push(userMessage);
      await this.persistConversationHistory();

      // Get response from LangChain
      const response = await chatModel.invoke(messages);
      
      const assistantMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response.content.toString(),
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      // Add to conversation history
      this.conversationHistory.push(assistantMessage);
      await this.persistConversationHistory();

      return {
        success: true,
        message: assistantMessage,
        tokenUsage
      };

    } catch (error) {
      console.error('Error in LangChain chat service:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async *sendMessageStream(
    content: string,
    options: {
      providerId?: string;
      modelId?: string;
      agentId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<{ delta: string; isComplete: boolean; message?: LangChainChatMessage; error?: string }> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      
      // Create LangChain chat model based on provider
      const chatModel = await this.createChatModel(providerId, modelId, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        streaming: true
      });

      // Build message history
      const messages: BaseMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === 'system') {
          messages.push(new SystemMessage(msg.content));
        }
      }

      // Add current user message
      messages.push(new HumanMessage(content));

      // Add current user message to history
      const userMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };
      this.conversationHistory.push(userMessage);
      await this.persistConversationHistory();

      // Stream response from LangChain
      let fullContent = '';
      
      const stream = await chatModel.stream(messages);
      for await (const chunk of stream) {
        const delta = chunk.content.toString();
        if (delta) {
          fullContent += delta;
          yield {
            delta,
            isComplete: false
          };
        }
      }

      // Create final message
      const assistantMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      // Add to conversation history
      this.conversationHistory.push(assistantMessage);
      await this.persistConversationHistory();

      yield {
        delta: '',
        isComplete: true,
        message: assistantMessage
      };

    } catch (error) {
      console.error('Error in LangChain streaming chat service:', error);
      yield {
        delta: '',
        isComplete: true,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async createChatModel(
    providerId: string, 
    modelId: string, 
    config: { temperature: number; maxTokens: number; streaming?: boolean; callbacks?: any[] }
  ) {
    const apiKey = await this.getApiKey(providerId);
    
    switch (providerId) {
      case 'openai':
        return new ChatOpenAI({
          modelName: modelId,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          streaming: config.streaming || false,
          openAIApiKey: apiKey,
          callbacks: config.callbacks
        });
      
      case 'anthropic':
        return new ChatAnthropic({
          model: modelId,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          streaming: config.streaming || false,
          anthropicApiKey: apiKey,
          callbacks: config.callbacks
        });
      
      default:
        throw new Error(`Unsupported provider for LangChain: ${providerId}`);
    }
  }

  private async getApiKey(providerId: string): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
      try {
        const result = await window.electronAPI.ai.getAPIKey(providerId);
        if (result.success && result.apiKey) {
          return result.apiKey;
        }
      } catch (error) {
        console.error('Error getting API key from store:', error);
      }
    }

    throw new Error(`No API key available for ${providerId}`);
  }

  private async getProviderAndModel(options: {
    providerId?: string;
    modelId?: string;
  }): Promise<{ providerId: string; modelId: string }> {
    let providerId = options.providerId;
    let modelId = options.modelId;

    // If not specified, use default
    if (!providerId || !modelId) {
      const defaultConfig = await this.providerManager.getDefault();
      if (defaultConfig) {
        providerId = providerId || defaultConfig.providerId;
        modelId = modelId || defaultConfig.modelId;
      }
    }

    // Fallback to first available provider
    if (!providerId || !modelId) {
      const availableProviders = await this.providerManager.getAvailableProviders();
      if (availableProviders.length > 0) {
        const firstProvider = availableProviders[0];
        providerId = providerId || firstProvider.id;
        modelId = modelId || firstProvider.config.defaultModel;
      }
    }

    if (!providerId || !modelId) {
      throw new Error('No AI provider or model available');
    }

    return { providerId, modelId };
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Set current project path for state management
  async setCurrentProject(projectPath: string | null): Promise<void> {
    this.currentProjectPath = projectPath;
    if (projectPath) {
      // Load conversation history from chat history manager
      const persistedHistory = await chatHistoryManager.loadChatHistory(projectPath);
      this.conversationHistory = persistedHistory.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        agentId: msg.agentId,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
    } else {
      this.conversationHistory = [];
    }
  }

  // Get conversation history
  getConversationHistory(): LangChainChatMessage[] {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  async clearConversation(): Promise<void> {
    this.conversationHistory = [];
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    if (this.currentProjectPath) {
      await chatHistoryManager.clearChatHistory(this.currentProjectPath);
    }
  }

  // Get session token usage
  getSessionTokenUsage(): TokenUsage {
    return { ...this.sessionTokenUsage };
  }

  // Clear session token usage
  clearSessionTokenUsage(): void {
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
  }

  // Private method to persist conversation history
  private async persistConversationHistory(): Promise<void> {
    if (this.currentProjectPath) {
      // Convert LangChainChatMessage to ChatServiceMessage format
      const chatServiceMessages = this.conversationHistory.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        agentId: msg.agentId,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
      await chatHistoryManager.saveChatHistory(this.currentProjectPath, chatServiceMessages);
    }
  }

  // Get available providers
  async getAvailableProviders() {
    return this.providerManager.getAvailableProviders();
  }

  // Get provider models
  async getProviderModels(providerId: string) {
    const provider = this.providerManager.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return provider.getModels();
  }

  // Test provider connection
  async testProvider(providerId: string) {
    const provider = this.providerManager.getProvider(providerId);
    if (!provider) {
      return { success: false, error: `Provider ${providerId} not found` };
    }
    return provider.testConnection();
  }
}

// Singleton instance
let langChainChatServiceInstance: LangChainChatService | null = null;

export function getLangChainChatService(): LangChainChatService {
  if (!langChainChatServiceInstance) {
    langChainChatServiceInstance = new LangChainChatService();
  }
  return langChainChatServiceInstance;
}