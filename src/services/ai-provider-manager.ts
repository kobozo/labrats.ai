import { AIProvider, AIProviderManager, AIProviderConfig, AIProvidersConfig } from '../types/ai-provider';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import aiProvidersConfig from '../config/ai-providers.json';

export class AIProviderManagerImpl implements AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private config: AIProvidersConfig;

  constructor() {
    this.config = aiProvidersConfig as AIProvidersConfig;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize Anthropic API provider
    const anthropicConfig = this.config.providers.anthropic;
    if (anthropicConfig) {
      const anthropicProvider = new AnthropicProvider(anthropicConfig);
      this.providers.set('anthropic', anthropicProvider);
    }

    // Claude CLI and Claude Code SDK providers removed

    // Future providers can be added here
    const openaiConfig = this.config.providers.openai;
    if (openaiConfig) {
      const openaiProvider = new OpenAIProvider(openaiConfig);
      this.providers.set('openai', openaiProvider);
    }
  }

  getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  async getAvailableProviders(): Promise<AIProvider[]> {
    const providers = this.getProviders();
    const availableProviders: AIProvider[] = [];

    for (const provider of providers) {
      try {
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          availableProviders.push(provider);
        }
      } catch (error) {
        console.error(`Error checking availability for provider ${provider.id}:`, error);
      }
    }

    return availableProviders;
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  async setDefault(providerId: string, modelId: string): Promise<void> {
    // Store the default provider and model in the config
    if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
      try {
        await window.electronAPI.config.set('agents', 'defaultProvider', providerId);
        await window.electronAPI.config.set('agents', 'defaultModel', modelId);
      } catch (error) {
        console.error('Error setting default provider/model:', error);
        throw error;
      }
    } else {
      throw new Error('Electron API not available');
    }
  }

  async getDefault(): Promise<{ providerId: string; modelId: string } | null> {
    // Get the default provider and model from the config
    if (typeof window !== 'undefined' && window.electronAPI?.config?.get) {
      try {
        const defaultProvider = await window.electronAPI.config.get('agents', 'defaultProvider');
        const defaultModel = await window.electronAPI.config.get('agents', 'defaultModel');

        if (defaultProvider && defaultModel) {
          return {
            providerId: defaultProvider,
            modelId: defaultModel
          };
        }

        // Return fallback defaults with priority order
        const availableProviders = await this.getAvailableProviders();
        if (availableProviders.length > 0) {
          // Prefer anthropic provider as primary, fallback to others
          const preferredProvider = availableProviders.find(p => p.id === 'anthropic') ||
                                  availableProviders[0];

          return {
            providerId: preferredProvider.id,
            modelId: preferredProvider.config.defaultModel
          };
        }

        return null;
      } catch (error) {
        console.error('Error getting default provider/model:', error);
        return null;
      }
    }

    return null;
  }

  // Helper method to get provider configuration
  getProviderConfig(providerId: string): AIProviderConfig | undefined {
    return this.config.providers[providerId];
  }

  // Helper method to get all provider configurations
  getAllProviderConfigs(): { [key: string]: AIProviderConfig } {
    return this.config.providers;
  }
}

// Singleton instance
let providerManagerInstance: AIProviderManagerImpl | null = null;

export function getAIProviderManager(): AIProviderManagerImpl {
  if (!providerManagerInstance) {
    providerManagerInstance = new AIProviderManagerImpl();
  }
  return providerManagerInstance;
}