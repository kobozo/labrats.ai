import {
  AIProvider,
  AIProviderConfig,
  AIModel,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChatResponse
} from '../../types/ai-provider';

export class ClaudeCLIProvider implements AIProvider {
  public readonly id = 'claude-cli';
  public readonly name = 'Claude Code';
  public readonly config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Claude Code is installed and accessible
      return await this.checkClaudeCliInstallation();
    } catch (error) {
      console.error('Error checking Claude Code availability:', error);
      return false;
    }
  }

  private async checkClaudeCliInstallation(): Promise<boolean> {
    // This would need to be implemented in the main process
    // For now, we'll use a placeholder that calls electron API
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        // We'll need to add this IPC method to check CLI availability
        const result = await window.electronAPI.checkCommand?.('claude');
        return result?.available || false;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  async getModels(): Promise<AIModel[]> {
    // Claude Code doesn't allow model selection - it uses whatever model is configured in the CLI
    // Return a single placeholder model to indicate this
    return [
      {
        id: 'claude-cli-configured',
        name: 'Claude Code (Configured Model)',
        description: 'Model selection is controlled by Claude Code configuration.',
        contextWindow: 200000,
        maxTokens: 32000,
        features: {
          streaming: true,
          functionCalling: true,
          vision: true,
          codeGeneration: true
        }
      }
    ];
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      // This would execute the Claude Code command through the main process
      // For now, we'll use a placeholder that would need IPC implementation
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.executeClaudeCommand?.({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          maxTokens: request.maxTokens
        });

        if (result?.success) {
          return {
            id: `cli-${Date.now()}`,
            model: request.model,
            choices: [{
              message: {
                role: 'assistant',
                content: result.content || ''
              },
              finishReason: 'stop'
            }],
            usage: {
              promptTokens: result.usage?.promptTokens || 0,
              completionTokens: result.usage?.completionTokens || 0,
              totalTokens: result.usage?.totalTokens || 0
            }
          };
        }
      }

      throw new Error('Claude Code execution failed');
    } catch (error) {
      throw new Error(`Claude Code error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamingChatResponse> {
    // Claude Code streaming would be implemented through IPC with the main process
    // For now, we'll fall back to non-streaming and yield the result
    try {
      const response = await this.chatCompletion(request);
      const content = response.choices[0]?.message.content || '';
      
      // Simulate streaming by yielding chunks
      const words = content.split(' ');
      for (let i = 0; i < words.length; i++) {
        yield {
          id: response.id,
          model: response.model,
          delta: {
            content: (i === 0 ? '' : ' ') + words[i]
          }
        };
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      yield {
        id: response.id,
        model: response.model,
        delta: {},
        finishReason: 'stop'
      };
    } catch (error) {
      throw error;
    }
  }

  async validateCredentials(): Promise<boolean> {
    // For CLI, we just check if the command is available and working
    try {
      return await this.checkClaudeCliInstallation();
    } catch (error) {
      return false;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        return { 
          success: false, 
          error: 'Claude Code not found. Please install it with: npm install -g @anthropic-ai/claude-cli' 
        };
      }

      // Test with a simple command
      if (typeof window !== 'undefined' && window.electronAPI?.executeClaudeCommand) {
        const testResult = await window.electronAPI.executeClaudeCommand({
          model: this.config.defaultModel,
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 10
        });

        if (testResult?.success) {
          return { success: true };
        } else {
          return { success: false, error: testResult?.error || 'CLI test failed' };
        }
      }

      return { success: false, error: 'Electron API not available' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}