/**
 * Embedding Service
 * Handles text-to-vector conversion using various AI providers
 */

import { getAIProviderManager } from './ai-provider-manager';
import { AIProvider } from '../types/ai-provider';

export interface EmbeddingOptions {
  providerId: string;
  modelId: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  tokenCount?: number;
}

export class EmbeddingService {
  private static instance: EmbeddingService;
  private providerManager = getAIProviderManager();
  private cache: Map<string, EmbeddingResult> = new Map();
  
  private constructor() {}
  
  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }
  
  /**
   * Generate embedding for a single text
   */
  async embedText(text: string, options: EmbeddingOptions): Promise<EmbeddingResult> {
    // Check cache first
    const cacheKey = `${options.providerId}:${options.modelId}:${text}`;
    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const provider = await this.providerManager.getProvider(options.providerId);
    if (!provider) {
      throw new Error(`Provider ${options.providerId} not found`);
    }
    
    // Check if provider supports embeddings
    if (!provider.config.features.embeddings) {
      throw new Error(`Provider ${options.providerId} does not support embeddings`);
    }
    
    const result = await this.generateEmbedding(provider, text, options);
    
    // Cache the result
    if (cacheKey) {
      this.cache.set(cacheKey, result);
    }
    
    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    return result;
  }
  
  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[], options: EmbeddingOptions): Promise<EmbeddingResult[]> {
    // For now, process sequentially
    // TODO: Implement proper batch processing for providers that support it
    const results: EmbeddingResult[] = [];
    
    for (const text of texts) {
      const result = await this.embedText(text, options);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Get supported embedding models for a provider
   */
  async getEmbeddingModels(providerId: string): Promise<Array<{ id: string; name: string; dimensions: number }>> {
    // This would be extended based on each provider's capabilities
    const models: Record<string, Array<{ id: string; name: string; dimensions: number }>> = {
      openai: [
        { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', dimensions: 1536 },
        { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', dimensions: 3072 },
        { id: 'text-embedding-ada-002', name: 'Text Embedding Ada 002', dimensions: 1536 }
      ],
      anthropic: [
        { id: 'claude-3-embed', name: 'Claude 3 Embeddings', dimensions: 1024 }
      ],
      ollama: [
        { id: 'nomic-embed-text', name: 'Nomic Embed Text', dimensions: 768 },
        { id: 'all-minilm', name: 'All-MiniLM-L6-v2', dimensions: 384 },
        { id: 'mxbai-embed-large', name: 'Mxbai Embed Large', dimensions: 1024 }
      ]
    };
    
    return models[providerId] || [];
  }
  
  /**
   * Generate embedding using a specific provider
   */
  private async generateEmbedding(
    provider: AIProvider,
    text: string,
    options: EmbeddingOptions
  ): Promise<EmbeddingResult> {
    // Provider-specific implementations
    switch (provider.id) {
      case 'openai':
        return this.generateOpenAIEmbedding(provider, text, options);
      
      case 'anthropic':
        return this.generateAnthropicEmbedding(provider, text, options);
      
      case 'ollama':
        return this.generateOllamaEmbedding(provider, text, options);
      
      default:
        throw new Error(`Embedding generation not implemented for provider ${provider.id}`);
    }
  }
  
  /**
   * OpenAI embedding generation
   */
  private async generateOpenAIEmbedding(
    provider: AIProvider,
    text: string,
    options: EmbeddingOptions
  ): Promise<EmbeddingResult> {
    // Get API key from config
    let apiKey: string | undefined;
    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
      const result = await window.electronAPI.ai.getAPIKey(provider.id);
      if (result.success && result.apiKey) {
        apiKey = result.apiKey;
      }
    }
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: options.modelId || 'text-embedding-3-small',
        encoding_format: 'float'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI embedding error: ${error.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    const embedding = data.data[0].embedding;
    
    return {
      embedding,
      dimensions: embedding.length,
      tokenCount: data.usage?.total_tokens
    };
  }
  
  /**
   * Anthropic embedding generation (placeholder)
   */
  private async generateAnthropicEmbedding(
    provider: AIProvider,
    text: string,
    options: EmbeddingOptions
  ): Promise<EmbeddingResult> {
    // Anthropic doesn't currently offer embeddings API
    // This is a placeholder for future implementation
    throw new Error('Anthropic embeddings not yet available');
  }
  
  /**
   * Ollama embedding generation
   */
  private async generateOllamaEmbedding(
    provider: AIProvider,
    text: string,
    options: EmbeddingOptions
  ): Promise<EmbeddingResult> {
    // For Ollama, use local endpoint
    const endpoint = 'http://localhost:11434';
    
    const response = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.modelId || 'nomic-embed-text',
        prompt: text
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const embedding = data.embedding;
    
    return {
      embedding,
      dimensions: embedding.length
    };
  }
}

// Export singleton instance
export const embeddingService = EmbeddingService.getInstance();