import {
  AIProvider,
  AIProviderConfig,
  AIModel,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChatResponse,
  ChatMessage
} from '../../types/ai-provider';

export class AnthropicProvider implements AIProvider {
  public readonly id = 'anthropic';
  public readonly name = 'Anthropic';
  public readonly config: AIProviderConfig;
  
  private apiKey: string | null = null;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we have an API key stored
      const hasApiKey = await this.hasValidApiKey();
      return hasApiKey;
    } catch (error) {
      console.error('Error checking Anthropic availability:', error);
      return false;
    }
  }

  private async hasValidApiKey(): Promise<boolean> {
    // This would typically check with the main process for stored API key
    // For now, we'll check if apiKey is set
    if (!this.apiKey) {
      // Try to get from electron store if available
      if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
        try {
          const result = await window.electronAPI.ai.getAPIKey('anthropic');
          return result.success && !!result.apiKey;
        } catch (error) {
          return false;
        }
      }
      return false;
    }
    return this.apiKey.startsWith('sk-ant-api03-');
  }

  async getModels(): Promise<AIModel[]> {
    try {
      // Try to fetch models from Anthropic API
      // Note: Anthropic doesn't have a public models endpoint, so we'll attempt it
      // but fall back to a curated list of known models
      try {
        if (this.config.endpoints.models) {
          const apiKey = await this.getApiKey();
          const response = await fetch(this.config.endpoints.models, {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            // Transform Anthropic API response to our model format
            if (data.data && Array.isArray(data.data)) {
              return data.data.map((model: any) => ({
                id: model.id,
                name: model.display_name || model.id,
                description: this.getModelDescription(model.id),
                contextWindow: this.getContextWindow(model.id),
                maxTokens: this.getMaxTokens(model.id),
                inputCost: this.getInputCost(model.id),
                outputCost: this.getOutputCost(model.id),
                features: {
                  streaming: this.config.features.streaming,
                  functionCalling: this.config.features.functionCalling,
                  vision: this.config.features.vision,
                  codeGeneration: true
                }
              }));
            }
          }
        }
      } catch (apiError) {
        console.warn('Anthropic models API not available, using curated list:', apiError);
      }

      // Fallback to curated list of latest Anthropic models
      // Updated with latest models as of January 2025
      const curatedModels: AIModel[] = [
        {
          id: 'claude-opus-4-20250514',
          name: 'Claude Opus 4',
          description: 'Highest level of intelligence and capability',
          contextWindow: 200000,
          maxTokens: 32000,
          inputCost: 15.00,
          outputCost: 75.00,
          features: {
            streaming: true,
            functionCalling: true,
            vision: true,
            codeGeneration: true
          }
        },
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          description: 'High intelligence and balanced performance',
          contextWindow: 200000,
          maxTokens: 64000,
          inputCost: 3.00,
          outputCost: 15.00,
          features: {
            streaming: true,
            functionCalling: true,
            vision: true,
            codeGeneration: true
          }
        },
        {
          id: 'claude-3-7-sonnet-20250219',
          name: 'Claude Sonnet 3.7',
          description: 'High intelligence with toggleable extended thinking',
          contextWindow: 200000,
          maxTokens: 64000,
          inputCost: 3.00,
          outputCost: 15.00,
          features: {
            streaming: true,
            functionCalling: true,
            vision: true,
            codeGeneration: true
          }
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'High level of intelligence and capability',
          contextWindow: 200000,
          maxTokens: 8192,
          inputCost: 3.00,
          outputCost: 15.00,
          features: {
            streaming: true,
            functionCalling: true,
            vision: true,
            codeGeneration: true
          }
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          description: 'Intelligence at blazing speeds',
          contextWindow: 200000,
          maxTokens: 8192,
          inputCost: 0.25,
          outputCost: 1.25,
          features: {
            streaming: true,
            functionCalling: true,
            vision: true,
            codeGeneration: true
          }
        }
      ];

      return curatedModels;
    } catch (error) {
      console.error('Error fetching Anthropic models:', error);
      // Return a minimal fallback model based on config
      return [{
        id: this.config.defaultModel,
        name: this.config.defaultModel,
        description: 'Anthropic Claude model',
        contextWindow: this.config.features.contextWindow,
        maxTokens: this.config.features.maxTokens,
        features: {
          streaming: this.config.features.streaming,
          functionCalling: this.config.features.functionCalling,
          vision: this.config.features.vision,
          codeGeneration: true
        }
      }];
    }
  }

  private getModelDescription(modelId: string): string {
    const descriptions: { [key: string]: string } = {
      'claude-opus-4-20250514': 'Highest level of intelligence and capability',
      'claude-sonnet-4-20250514': 'High intelligence and balanced performance',
      'claude-3-7-sonnet-20250219': 'High intelligence with toggleable extended thinking',
      'claude-3-5-sonnet-20241022': 'High level of intelligence and capability',
      'claude-3-5-haiku-20241022': 'Intelligence at blazing speeds'
    };
    return descriptions[modelId] || `Anthropic ${modelId}`;
  }

  private getContextWindow(modelId: string): number {
    // All current Claude models have 200K context window
    return 200000;
  }

  private getMaxTokens(modelId: string): number {
    const maxTokens: { [key: string]: number } = {
      'claude-opus-4-20250514': 32000,
      'claude-sonnet-4-20250514': 64000,
      'claude-3-7-sonnet-20250219': 64000,
      'claude-3-5-sonnet-20241022': 8192,
      'claude-3-5-haiku-20241022': 8192
    };
    return maxTokens[modelId] || 8192;
  }

  private getInputCost(modelId: string): number {
    const costs: { [key: string]: number } = {
      'claude-opus-4-20250514': 15.00,
      'claude-sonnet-4-20250514': 3.00,
      'claude-3-7-sonnet-20250219': 3.00,
      'claude-3-5-sonnet-20241022': 3.00,
      'claude-3-5-haiku-20241022': 0.25
    };
    return costs[modelId] || 3.00;
  }

  private getOutputCost(modelId: string): number {
    const costs: { [key: string]: number } = {
      'claude-opus-4-20250514': 75.00,
      'claude-sonnet-4-20250514': 15.00,
      'claude-3-7-sonnet-20250219': 15.00,
      'claude-3-5-sonnet-20241022': 15.00,
      'claude-3-5-haiku-20241022': 1.25
    };
    return costs[modelId] || 15.00;
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }

    // Try to get from electron store
    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
      try {
        const result = await window.electronAPI.ai.getAPIKey('anthropic');
        if (result.success && result.apiKey) {
          this.apiKey = result.apiKey;
          return result.apiKey;
        }
      } catch (error) {
        console.error('Error getting API key from store:', error);
      }
    }

    throw new Error('No API key available for Anthropic');
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.config.endpoints.chat) {
      throw new Error('Chat endpoint is not configured for this provider.');
    }

    try {
      const apiKey = await this.getApiKey();
      const body = this.convertToAnthropicFormat(request);

      const response = await fetch(this.config.endpoints.chat, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return this.convertFromAnthropicFormat(data, request.model);
    } catch (error) {
      console.error('Error in chatCompletion:', error);
      throw error;
    }
  }

  async *streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamingChatResponse> {
    if (!this.config.endpoints.chat) {
      throw new Error('Chat endpoint is not configured for this provider.');
    }
    const apiKey = await this.getApiKey();
    const body = this.convertToAnthropicFormat({ ...request, stream: true });

    try {
      const response = await fetch(this.config.endpoints.chat, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'accept': 'text/event-stream'
        },
        body: JSON.stringify(body)
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6);
            const data = JSON.parse(jsonStr);
            const chunk = this.convertStreamFromAnthropicFormat(data, request.model);
            if (chunk) {
              yield chunk;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in streamChatCompletion:', error);
      throw error;
    }
  }

  async validateCredentials(apiKey?: string): Promise<boolean> {
    const keyToValidate = apiKey || await this.getApiKey();
    if (!keyToValidate) return false;

    if (!this.config.endpoints.models) {
      // If no models endpoint, we can't truly validate, so we'll rely on a basic format check
      return keyToValidate.startsWith('sk-ant-api03-');
    }

    try {
      const response = await fetch(this.config.endpoints.models, {
        method: 'GET',
        headers: {
          'x-api-key': keyToValidate,
          'anthropic-version': '2023-06-01'
        }
      });

      return response.ok || response.status === 429; // 429 is rate limit, which means API key is valid
    } catch (error) {
      console.error('Error validating Anthropic credentials:', error);
      return false;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const isValid = await this.validateCredentials();
      if (!isValid) {
        return { success: false, error: 'Invalid API key' };
      }
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'An unknown error occurred' 
      };
    }
  }

  private convertToAnthropicFormat(request: ChatCompletionRequest): any {
    // Extract system message if present
    const systemMessage = request.messages.find(msg => msg.role === 'system');
    const nonSystemMessages = request.messages.filter(msg => msg.role !== 'system');

    const anthropicRequest: any = {
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      messages: nonSystemMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    };

    if (systemMessage) {
      anthropicRequest.system = systemMessage.content;
    }

    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }

    return anthropicRequest;
  }

  private convertFromAnthropicFormat(data: any, model: string): ChatCompletionResponse {
    return {
      id: data.id,
      model: model,
      choices: [{
        message: {
          role: 'assistant',
          content: data.content[0]?.text || ''
        },
        finishReason: data.stop_reason || 'stop'
      }],
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    };
  }

  private convertStreamFromAnthropicFormat(data: any, model: string): StreamingChatResponse | null {
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return {
        id: data.id || 'stream',
        model: model,
        delta: {
          content: data.delta.text
        }
      };
    }

    if (data.type === 'message_stop') {
      return {
        id: data.id || 'stream',
        model: model,
        delta: {},
        finishReason: 'stop'
      };
    }

    return null;
  }
}