import { getAIProviderManager } from './ai-provider-manager';
import { ChatMessage, ChatCompletionRequest, StreamingChatResponse } from '../types/ai-provider';

export interface ChatServiceMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  providerId?: string;
  modelId?: string;
}

export interface ChatServiceResponse {
  success: boolean;
  message?: ChatServiceMessage;
  error?: string;
}

export class ChatService {
  private providerManager = getAIProviderManager();
  private conversationHistory: ChatServiceMessage[] = [];

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
  ): Promise<ChatServiceResponse> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      
      const provider = this.providerManager.getProvider(providerId);
      if (!provider) {
        return {
          success: false,
          error: `Provider ${providerId} not found`
        };
      }

      // Check if provider is available
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: `Provider ${providerId} is not available. Please check your configuration.`
        };
      }

      // Build message history
      const messages: ChatMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt
        });
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        });
      }

      // Add current user message
      const userMessage: ChatServiceMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      messages.push({
        role: 'user',
        content
      });

      // Add to conversation history
      this.conversationHistory.push(userMessage);

      // Create chat completion request
      const request: ChatCompletionRequest = {
        model: modelId,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: false
      };

      // Get response from provider
      const response = await provider.chatCompletion(request);
      
      if (response.choices && response.choices.length > 0) {
        const assistantMessage: ChatServiceMessage = {
          id: this.generateId(),
          role: 'assistant',
          content: response.choices[0].message.content,
          timestamp: new Date(),
          agentId: options.agentId,
          providerId,
          modelId
        };

        // Add to conversation history
        this.conversationHistory.push(assistantMessage);

        return {
          success: true,
          message: assistantMessage
        };
      }

      return {
        success: false,
        error: 'No response from AI provider'
      };

    } catch (error) {
      console.error('Error in chat service:', error);
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
  ): AsyncGenerator<{ delta: string; isComplete: boolean; message?: ChatServiceMessage; error?: string }> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      
      const provider = this.providerManager.getProvider(providerId);
      if (!provider) {
        yield {
          delta: '',
          isComplete: true,
          error: `Provider ${providerId} not found`
        };
        return;
      }

      // Check if provider is available
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        yield {
          delta: '',
          isComplete: true,
          error: `Provider ${providerId} is not available. Please check your configuration.`
        };
        return;
      }

      // Build message history
      const messages: ChatMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push({
          role: 'system',
          content: options.systemPrompt
        });
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        });
      }

      // Add current user message
      const userMessage: ChatServiceMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      messages.push({
        role: 'user',
        content
      });

      // Add to conversation history
      this.conversationHistory.push(userMessage);

      // Create chat completion request
      const request: ChatCompletionRequest = {
        model: modelId,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: true
      };

      // Stream response from provider
      let fullContent = '';
      
      for await (const chunk of provider.streamChatCompletion(request)) {
        if (chunk.delta.content) {
          fullContent += chunk.delta.content;
          yield {
            delta: chunk.delta.content,
            isComplete: false
          };
        }

        if (chunk.finishReason) {
          // Create final message
          const assistantMessage: ChatServiceMessage = {
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

          yield {
            delta: '',
            isComplete: true,
            message: assistantMessage
          };
          return;
        }
      }

    } catch (error) {
      console.error('Error in streaming chat service:', error);
      yield {
        delta: '',
        isComplete: true,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
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

  // Get conversation history
  getConversationHistory(): ChatServiceMessage[] {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  clearConversation(): void {
    this.conversationHistory = [];
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
let chatServiceInstance: ChatService | null = null;

export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService();
  }
  return chatServiceInstance;
}