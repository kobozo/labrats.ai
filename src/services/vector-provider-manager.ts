/**
 * Vector Provider Manager
 * Manages multiple vector store providers and handles routing
 */

import {
  VectorProvider,
  VectorProviderConfig,
  VectorProviderCapabilities
} from '../types/vector-provider';
import { BrowserLocalVectorStore } from './providers/vector/browser-local-vector-store';

export class VectorProviderManager {
  private static instance: VectorProviderManager;
  private providers: Map<string, VectorProvider> = new Map();
  private activeProviderId: string | null = null;
  
  private constructor() {
    this.initializeProviders();
  }
  
  static getInstance(): VectorProviderManager {
    if (!VectorProviderManager.instance) {
      VectorProviderManager.instance = new VectorProviderManager();
    }
    return VectorProviderManager.instance;
  }
  
  private initializeProviders(): void {
    // Register local vector store provider
    const localProvider = new BrowserLocalVectorStore();
    this.providers.set('local', localProvider);
    
    // Future providers can be added here
    // this.providers.set('pinecone', new PineconeProvider());
    // this.providers.set('weaviate', new WeaviateProvider());
  }
  
  /**
   * Get all registered providers
   */
  getProviders(): VectorProvider[] {
    return Array.from(this.providers.values());
  }
  
  /**
   * Get a specific provider by ID
   */
  getProvider(id: string): VectorProvider | undefined {
    return this.providers.get(id);
  }
  
  /**
   * Get the currently active provider
   */
  async getActiveProvider(): Promise<VectorProvider | null> {
    if (!this.activeProviderId) {
      // Get from config
      if (typeof window !== 'undefined' && window.electronAPI?.config?.get) {
        const config = await window.electronAPI.config.get('vectorStore', 'activeProvider');
        this.activeProviderId = config || 'local'; // Default to local
      } else {
        this.activeProviderId = 'local';
      }
    }
    
    const providerId = this.activeProviderId;
    if (!providerId) return null;
    return this.providers.get(providerId) || null;
  }
  
  /**
   * Set the active provider
   */
  async setActiveProvider(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    this.activeProviderId = providerId;
    
    // Save to config
    if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
      await window.electronAPI.config.set('vectorStore', 'activeProvider', providerId);
    }
  }
  
  /**
   * Initialize a provider with config
   */
  async initializeProvider(providerId: string, config: VectorProviderConfig): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    await provider.initialize(config);
    
    // Save config
    if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
      await window.electronAPI.config.set('vectorStore', `${providerId}Config`, config);
    }
  }
  
  /**
   * Get provider configuration
   */
  async getProviderConfig(providerId: string): Promise<VectorProviderConfig | null> {
    if (typeof window !== 'undefined' && window.electronAPI?.config?.get) {
      return await window.electronAPI.config.get('vectorStore', `${providerId}Config`);
    }
    return null;
  }
  
  /**
   * Test connection for a provider
   */
  async testProviderConnection(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    if (!provider.isInitialized) {
      const config = await this.getProviderConfig(providerId);
      if (config) {
        await provider.initialize(config);
      }
    }
    
    return await provider.testConnection();
  }
  
  /**
   * Get provider capabilities
   */
  getProviderCapabilities(providerId: string): VectorProviderCapabilities | null {
    const provider = this.providers.get(providerId);
    return provider ? provider.capabilities || null : null;
  }
  
  /**
   * Register a new provider
   */
  registerProvider(provider: VectorProvider): void {
    this.providers.set(provider.id, provider);
  }
}

// Export singleton instance
export const vectorProviderManager = VectorProviderManager.getInstance();