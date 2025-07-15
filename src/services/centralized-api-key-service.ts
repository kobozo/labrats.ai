import { ConfigManager } from '../main/config';
import { AIConfigService } from '../main/aiConfigService';

export interface APIKeyTestResult {
  success: boolean;
  error?: string;
  details?: any;
}

export interface ProviderConfig {
  enabled: boolean;
  encryptedApiKey?: string;
  [key: string]: any;
}

/**
 * Centralized API Key Management Service
 * 
 * This service provides a single point of truth for all API key operations
 * across the LabRats.ai application. It handles:
 * - API key retrieval and caching
 * - Encryption/decryption through AIConfigService
 * - Configuration management
 * - Provider validation and testing
 * - Consistent error handling
 */
export class CentralizedAPIKeyService {
  private static instance: CentralizedAPIKeyService;
  private aiConfigService: AIConfigService;
  private configManager: ConfigManager;
  private cache: Map<string, string> = new Map();
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {
    // Initialize services
    this.aiConfigService = AIConfigService.getInstance();
    this.configManager = new ConfigManager();
  }

  public static getInstance(): CentralizedAPIKeyService {
    if (!CentralizedAPIKeyService.instance) {
      CentralizedAPIKeyService.instance = new CentralizedAPIKeyService();
    }
    return CentralizedAPIKeyService.instance;
  }

  /**
   * Initialize the service (async operations)
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('[API-KEY-SERVICE] Initializing centralized API key service');
      // Any async initialization can go here
      this.isInitialized = true;
      console.log('[API-KEY-SERVICE] Centralized API key service initialized');
    })();

    return this.initPromise;
  }

  /**
   * Get API key for a specific provider
   * @param providerId - Provider identifier (e.g., 'openai', 'anthropic')
   * @returns Decrypted API key
   */
  async getAPIKey(providerId: string): Promise<string> {
    await this.initialize();

    console.log('[API-KEY-SERVICE] Getting API key for provider:', providerId);

    // Check cache first
    if (this.cache.has(providerId)) {
      console.log('[API-KEY-SERVICE] API key found in cache for:', providerId);
      return this.cache.get(providerId)!;
    }

    try {
      // Get from config
      const config = this.configManager.getAll();
      const serviceConfig = config?.ai?.services?.[providerId] as ProviderConfig;
      
      if (!serviceConfig?.encryptedApiKey) {
        throw new Error(`No API key configured for provider: ${providerId}`);
      }

      console.log('[API-KEY-SERVICE] Decrypting API key for:', providerId);
      
      // Decrypt using AIConfigService
      const decryptedKey = await this.aiConfigService.getAPIKey(providerId, serviceConfig.encryptedApiKey);
      
      // Cache the decrypted key
      this.cache.set(providerId, decryptedKey);
      
      console.log('[API-KEY-SERVICE] Successfully retrieved API key for:', providerId);
      return decryptedKey;
    } catch (error) {
      console.error('[API-KEY-SERVICE] Failed to get API key for provider:', providerId, error);
      throw error;
    }
  }

  /**
   * Set API key for a specific provider
   * @param providerId - Provider identifier
   * @param apiKey - Plain text API key
   */
  async setAPIKey(providerId: string, apiKey: string): Promise<void> {
    await this.initialize();

    console.log('[API-KEY-SERVICE] Setting API key for provider:', providerId);

    try {
      // Validate API key format
      const validation = this.aiConfigService.validateAPIKey(providerId, apiKey);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid API key format');
      }

      // Store encrypted API key
      await this.aiConfigService.storeAPIKey(providerId, apiKey);

      // Update cache
      this.cache.set(providerId, apiKey);

      // Update config to mark provider as enabled
      const config = this.configManager.getAll();
      const services = config?.ai?.services || {};
      
      services[providerId] = {
        ...services[providerId],
        enabled: true,
        encryptedApiKey: 'managed_by_aiConfigService' // Placeholder, actual encrypted key stored separately
      };

      this.configManager.set('ai', 'services', services);

      console.log('[API-KEY-SERVICE] Successfully set API key for provider:', providerId);
    } catch (error) {
      console.error('[API-KEY-SERVICE] Failed to set API key for provider:', providerId, error);
      throw error;
    }
  }

  /**
   * Remove API key for a specific provider
   * @param providerId - Provider identifier
   */
  async removeAPIKey(providerId: string): Promise<void> {
    await this.initialize();

    console.log('[API-KEY-SERVICE] Removing API key for provider:', providerId);

    try {
      // Remove from AIConfigService
      await this.aiConfigService.removeAPIKey(providerId);

      // Remove from cache
      this.cache.delete(providerId);

      // Update config
      const config = this.configManager.getAll();
      const services = config?.ai?.services || {};
      
      if (services[providerId]) {
        delete services[providerId].encryptedApiKey;
        services[providerId].enabled = false;
        this.configManager.set('ai', 'services', services);
      }

      console.log('[API-KEY-SERVICE] Successfully removed API key for provider:', providerId);
    } catch (error) {
      console.error('[API-KEY-SERVICE] Failed to remove API key for provider:', providerId, error);
      throw error;
    }
  }

  /**
   * Check if a provider is configured with an API key
   * @param providerId - Provider identifier
   * @returns True if provider has a valid API key
   */
  async isProviderConfigured(providerId: string): Promise<boolean> {
    await this.initialize();

    try {
      await this.getAPIKey(providerId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all configured providers
   * @returns Array of provider IDs that have API keys
   */
  async getConfiguredProviders(): Promise<string[]> {
    await this.initialize();

    console.log('[API-KEY-SERVICE] Getting configured providers');

    try {
      const config = this.configManager.getAll();
      const services = config?.ai?.services || {};
      const configured: string[] = [];

      for (const [providerId, serviceConfig] of Object.entries(services)) {
        if ((serviceConfig as ProviderConfig)?.encryptedApiKey) {
          configured.push(providerId);
        }
      }

      console.log('[API-KEY-SERVICE] Configured providers:', configured);
      return configured;
    } catch (error) {
      console.error('[API-KEY-SERVICE] Failed to get configured providers:', error);
      return [];
    }
  }

  /**
   * Test API key connection for a provider
   * @param providerId - Provider identifier
   * @returns Test result with success status and error details
   */
  async testConnection(providerId: string): Promise<APIKeyTestResult> {
    await this.initialize();

    console.log('[API-KEY-SERVICE] Testing connection for provider:', providerId);

    try {
      const apiKey = await this.getAPIKey(providerId);
      const result = await this.aiConfigService.testAPIKey(providerId, apiKey);
      
      console.log('[API-KEY-SERVICE] Connection test result for', providerId, ':', result);
      return result;
    } catch (error) {
      console.error('[API-KEY-SERVICE] Connection test failed for provider:', providerId, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate API key format for a provider
   * @param providerId - Provider identifier
   * @param apiKey - API key to validate
   * @returns Validation result
   */
  validateAPIKey(providerId: string, apiKey: string): { valid: boolean; error?: string } {
    console.log('[API-KEY-SERVICE] Validating API key format for provider:', providerId);
    return this.aiConfigService.validateAPIKey(providerId, apiKey);
  }

  /**
   * Clear the API key cache
   * Useful for testing or when keys are updated externally
   */
  clearCache(): void {
    console.log('[API-KEY-SERVICE] Clearing API key cache');
    this.cache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { cachedProviders: string[]; cacheSize: number } {
    return {
      cachedProviders: Array.from(this.cache.keys()),
      cacheSize: this.cache.size
    };
  }

  /**
   * Get service configuration for a provider
   * @param providerId - Provider identifier
   * @returns Provider configuration
   */
  getProviderConfig(providerId: string): ProviderConfig | null {
    try {
      const config = this.configManager.getAll();
      return config?.ai?.services?.[providerId] as ProviderConfig || null;
    } catch (error) {
      console.error('[API-KEY-SERVICE] Failed to get provider config:', error);
      return null;
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance for convenience
export const centralizedAPIKeyService = CentralizedAPIKeyService.getInstance();