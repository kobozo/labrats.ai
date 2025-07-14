import {
  AIProvider,
  AIProviderConfig,
  AIModel,
  AIModelType,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChatResponse
} from '../../types/ai-provider';
import openaiModels from '../../config/models/openai-models.json';

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
    if (!this.config.endpoints.models) {
      return this.getFallbackModels();
    }
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
        // Filter out embedding models and map the rest
        const models = data.data
          .filter((model: any) => !model.id.includes('embedding') && !model.id.includes('ada'))
          .map((model: any) => {
            // Determine model type based on ID
            let modelType: AIModelType = 'reasoning';
            
            if (model.id.includes('instruct') || model.id.includes('davinci') || model.id.includes('babbage') || model.id.includes('curie')) {
              modelType = 'completion';
            } else if (model.id.includes('whisper') || model.id.includes('dall-e') || model.id.includes('tts')) {
              modelType = 'specialized';
            }
            
            return {
              id: model.id,
              name: this.formatModelName(model.id),
              description: this.getModelDescription(model.id),
              type: modelType,
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
            };
          });
        
        return models;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching OpenAI models:', error);
      
      // Fallback to default model only
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): AIModel[] {
    // When offline or API unavailable, return only the default configured model
    const defaultModel = this.config.defaultModel;
    const modelFromJson = openaiModels.models.find(m => m.id === defaultModel);
    
    if (modelFromJson) {
      return [{
        ...modelFromJson,
        type: modelFromJson.type as AIModelType
      }];
    }
    
    // Absolute fallback - return minimal model info
    return [{
      id: defaultModel,
      name: defaultModel,
      description: 'Default OpenAI model (offline mode)',
      type: 'reasoning' as AIModelType,
      contextWindow: 8192,
      maxTokens: 4096,
      features: {
        streaming: true,
        functionCalling: true,
        vision: false,
        codeGeneration: true
      }
    }];
  }

  private formatModelName(modelId: string): string {
    const model = openaiModels.models.find(m => m.id === modelId);
    if (model) return model.name;
    
    // For models not in our JSON, format the ID nicely
    return modelId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getModelDescription(modelId: string): string {
    const model = openaiModels.models.find(m => m.id === modelId);
    if (model) return model.description;
    
    // Fallback descriptions for models not in our JSON
    if (modelId.includes('gpt-4')) {
      return 'Most capable GPT model, best for complex tasks requiring deep understanding';
    } else if (modelId.includes('gpt-3.5')) {
      return 'Fast and efficient model, good for most everyday tasks';
    }
    return `OpenAI ${modelId}`;
  }

  private getContextWindow(modelId: string): number {
    const model = openaiModels.models.find(m => m.id === modelId);
    if (model) return model.contextWindow;
    
    // Fallback for models not in our JSON
    if (modelId.includes('gpt-4-turbo')) return 128000;
    if (modelId.includes('gpt-4-32k')) return 32768;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('16k')) return 16385;
    if (modelId.includes('gpt-3.5')) return 4096;
    return 4096;
  }

  private getMaxTokens(modelId: string): number {
    const model = openaiModels.models.find(m => m.id === modelId);
    return model?.maxTokens || 4096; // Standard max output for OpenAI models
  }

  private getInputCost(modelId: string): number {
    const model = openaiModels.models.find(m => m.id === modelId);
    if (model) return model.inputCost;
    
    // Fallback for models not in our JSON
    if (modelId.includes('gpt-4-turbo')) return 0.01;
    if (modelId.includes('gpt-4')) return 0.03;
    if (modelId.includes('gpt-3.5')) return 0.0015;
    return 0.01;
  }

  private getOutputCost(modelId: string): number {
    const model = openaiModels.models.find(m => m.id === modelId);
    if (model) return model.outputCost;
    
    // Fallback for models not in our JSON
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
    if (!this.config.endpoints.chat) {
      throw new Error('Chat endpoint is not configured for this provider.');
    }
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
    if (!this.config.endpoints.chat) {
      throw new Error('Chat endpoint is not configured for this provider.');
    }
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
              
              // Transform OpenAI response format to our standardized format
              if (parsed.choices && parsed.choices.length > 0) {
                const choice = parsed.choices[0];
                const streamingResponse: StreamingChatResponse = {
                  id: parsed.id,
                  model: parsed.model,
                  delta: {
                    role: choice.delta?.role,
                    content: choice.delta?.content
                  },
                  finishReason: choice.finish_reason
                };
                yield streamingResponse;
              }
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
    const keyToValidate = apiKey || await this.getApiKey();
    if (!keyToValidate) return false;

    if (!this.config.endpoints.models) {
      // If no models endpoint, we can't truly validate, so we'll rely on a basic format check
      return keyToValidate.startsWith('sk-');
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
  
  async isOnline(): Promise<boolean> {
    try {
      // Try to fetch a small resource to check connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'HEAD',
        signal: controller.signal
      }).catch(() => null);
      
      clearTimeout(timeoutId);
      return response !== null && (response.ok || response.status === 401 || response.status === 403);
    } catch (error) {
      return false;
    }
  }
}