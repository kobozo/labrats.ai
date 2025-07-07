import {
  AIProvider,
  AIProviderConfig,
  AIModel,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChatResponse
} from '../../types/ai-provider';

export class OpenAIProvider implements AIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
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
      const hasApiKey = await this.hasValidApiKey();
      return hasApiKey;
    } catch (error) {
      console.error('Error checking OpenAI availability:', error);
      return false;
    }
  }

  private async hasValidApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
        try {
          const result = await window.electronAPI.ai.getAPIKey('openai');
          return result.success && !!result.apiKey;
        } catch (error) {
          return false;
        }
      }
      return false;
    }
    return this.apiKey.startsWith('sk-');
  }

  async getModels(): Promise<AIModel[]> {
    try {
      const apiKey = await this.getApiKey();
      
      // Fetch models from OpenAI API
      const response = await fetch(this.config.endpoints.models, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        // Filter to only include GPT models suitable for chat
        const chatModels = data.data.filter((model: any) => 
          model.id.includes('gpt') && 
          !model.id.includes('instruct') &&
          !model.id.includes('edit')
        );

        return chatModels.map((model: any) => ({
          id: model.id,
          name: this.formatModelName(model.id),
          description: this.getModelDescription(model.id),
          contextWindow: this.getContextWindow(model.id),
          maxTokens: this.getMaxTokens(model.id),
          inputCost: this.getInputCost(model.id),
          outputCost: this.getOutputCost(model.id),
          features: {
            streaming: true,
            functionCalling: this.supportsFunctionCalling(model.id),
            vision: this.supportsVision(model.id),
            codeGeneration: true
          }
        }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching OpenAI models:', error);
      
      // Fallback to known models
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): AIModel[] {
    return [
      {
        id: 'gpt-4-turbo-preview',
        name: 'GPT-4 Turbo',
        description: 'Most capable GPT-4 model with improved instructions following',
        contextWindow: 128000,
        maxTokens: 4096,
        inputCost: 0.01,
        outputCost: 0.03,
        features: {
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        }
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'More capable than any GPT-3.5 model, able to do more complex tasks',
        contextWindow: 8192,
        maxTokens: 4096,
        inputCost: 0.03,
        outputCost: 0.06,
        features: {
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        }
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast, inexpensive model for simple tasks',
        contextWindow: 16385,
        maxTokens: 4096,
        inputCost: 0.0015,
        outputCost: 0.002,
        features: {
          streaming: true,
          functionCalling: true,
          vision: false,
          codeGeneration: true
        }
      }
    ];
  }

  private formatModelName(modelId: string): string {
    const nameMap: { [key: string]: string } = {
      'gpt-4-turbo-preview': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-4-32k': 'GPT-4 32K',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-3.5-turbo-16k': 'GPT-3.5 Turbo 16K'
    };
    return nameMap[modelId] || modelId;
  }

  private getModelDescription(modelId: string): string {
    if (modelId.includes('gpt-4')) {
      return 'Most capable GPT model, best for complex tasks requiring deep understanding';
    } else if (modelId.includes('gpt-3.5')) {
      return 'Fast and efficient model, good for most everyday tasks';
    }
    return `OpenAI ${modelId}`;
  }

  private getContextWindow(modelId: string): number {
    if (modelId.includes('gpt-4-turbo')) return 128000;
    if (modelId.includes('gpt-4-32k')) return 32768;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('16k')) return 16385;
    if (modelId.includes('gpt-3.5')) return 4096;
    return 4096;
  }

  private getMaxTokens(modelId: string): number {
    return 4096; // Standard max output for OpenAI models
  }

  private getInputCost(modelId: string): number {
    if (modelId.includes('gpt-4-turbo')) return 0.01;
    if (modelId.includes('gpt-4')) return 0.03;
    if (modelId.includes('gpt-3.5')) return 0.0015;
    return 0.01;
  }

  private getOutputCost(modelId: string): number {
    if (modelId.includes('gpt-4-turbo')) return 0.03;
    if (modelId.includes('gpt-4')) return 0.06;
    if (modelId.includes('gpt-3.5')) return 0.002;
    return 0.03;
  }

  private supportsFunctionCalling(modelId: string): boolean {
    return modelId.includes('gpt-4') || modelId.includes('gpt-3.5-turbo');
  }

  private supportsVision(modelId: string): boolean {
    return modelId.includes('gpt-4-vision') || modelId.includes('gpt-4-turbo');
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }

    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
      try {
        const result = await window.electronAPI.ai.getAPIKey('openai');
        if (result.success && result.apiKey) {
          this.apiKey = result.apiKey;
          return result.apiKey;
        }
      } catch (error) {
        console.error('Error getting API key from store:', error);
      }
    }

    throw new Error('No API key available for OpenAI');
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const apiKey = await this.getApiKey();
    
    const openaiRequest = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false
    };
    
    const response = await fetch(this.config.endpoints.chat, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data as ChatCompletionResponse;
  }

  async *streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamingChatResponse> {
    const apiKey = await this.getApiKey();
    
    const openaiRequest = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true
    };
    
    const response = await fetch(this.config.endpoints.chat, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              yield parsed as StreamingChatResponse;
            } catch (error) {
              console.error('Error parsing streaming response:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async validateCredentials(apiKey?: string): Promise<boolean> {
    const keyToValidate = apiKey || this.apiKey;
    if (!keyToValidate) {
      return false;
    }

    try {
      const response = await fetch(this.config.endpoints.models, {
        headers: {
          'Authorization': `Bearer ${keyToValidate}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Error validating OpenAI credentials:', error);
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
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}