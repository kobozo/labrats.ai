import { EventEmitter } from 'events';
import { CryptoService } from './cryptoService';

export interface AIService {
  id: string;
  name: string;
  description: string;
  keyRequired: boolean;
  keyPlaceholder: string;
  docs?: string;
  enabled: boolean;
  isOnline?: boolean; // Track online status
}

export interface AIServiceConfig {
  id: string;
  enabled: boolean;
  apiKey?: string; // This will be encrypted when stored
}

export class AIConfigService extends EventEmitter {
  private static instance: AIConfigService;
  private cryptoService: CryptoService;
  private supportedServices: AIService[] = [
    {
      id: 'anthropic',
      name: 'anthropic',
      description: 'Anthropic\'s Claude for code assistance and development',
      keyRequired: true,
      keyPlaceholder: 'sk-ant-api03-...',
      docs: 'https://docs.anthropic.com/en/api/getting-started',
      enabled: false
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'OpenAI GPT models for code generation and assistance',
      keyRequired: true,
      keyPlaceholder: 'sk-proj-...',
      docs: 'https://platform.openai.com/docs/quickstart',
      enabled: false
    },
    {
      id: 'github-copilot',
      name: 'GitHub Copilot',
      description: 'GitHub\'s AI pair programmer',
      keyRequired: false,
      keyPlaceholder: 'Uses GitHub authentication',
      docs: 'https://docs.github.com/en/copilot',
      enabled: false
    }
  ];

  constructor() {
    super();
    this.cryptoService = CryptoService.getInstance();
  }

  static getInstance(): AIConfigService {
    if (!AIConfigService.instance) {
      AIConfigService.instance = new AIConfigService();
    }
    return AIConfigService.instance;
  }

  /**
   * Get all supported AI services
   */
  getSupportedServices(): AIService[] {
    return [...this.supportedServices];
  }

  /**
   * Get specific AI service by ID
   */
  getService(serviceId: string): AIService | undefined {
    return this.supportedServices.find(service => service.id === serviceId);
  }

  /**
   * Check if master key is set up
   */
  async isMasterKeySetup(): Promise<boolean> {
    return this.cryptoService.hasMasterKey();
  }

  /**
   * Setup master key (first time setup)
   */
  async setupMasterKey(masterKey: string): Promise<void> {
    if (!this.cryptoService.isValidMasterKey(masterKey)) {
      throw new Error('Invalid master key format');
    }
    await this.cryptoService.storeMasterKey(masterKey);
    this.emit('master-key-setup');
  }

  /**
   * Generate a new master key
   */
  generateMasterKey(): string {
    return this.cryptoService.generateMasterKey();
  }

  /**
   * Encrypt and store API key for a service
   */
  async storeAPIKey(serviceId: string, apiKey: string): Promise<void> {
    try {
      const masterKey = await this.cryptoService.loadMasterKey();
      const encryptedKey = await this.cryptoService.encrypt(apiKey, masterKey);
      
      // Store in electron-store (this will be handled in main.ts)
      this.emit('api-key-store', serviceId, encryptedKey);
    } catch (error) {
      throw new Error(`Failed to store API key: ${error}`);
    }
  }

  /**
   * Decrypt and retrieve API key for a service
   */
  async getAPIKey(serviceId: string, encryptedKey: string): Promise<string> {
    try {
      const masterKey = await this.cryptoService.loadMasterKey();
      return await this.cryptoService.decrypt(encryptedKey, masterKey);
    } catch (error) {
      throw new Error(`Failed to decrypt API key: ${error}`);
    }
  }

  /**
   * Remove API key for a service
   */
  async removeAPIKey(serviceId: string): Promise<void> {
    this.emit('api-key-remove', serviceId);
  }

  /**
   * Enable/disable a service
   */
  async setServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
    const serviceIndex = this.supportedServices.findIndex(s => s.id === serviceId);
    if (serviceIndex !== -1) {
      this.supportedServices[serviceIndex].enabled = enabled;
      this.emit('service-enabled', serviceId, enabled);
    }
  }

  /**
   * Validate API key format for a service
   */
  validateAPIKey(serviceId: string, apiKey: string): { valid: boolean; error?: string } {
    const service = this.getService(serviceId);
    if (!service) {
      return { valid: false, error: 'Unknown service' };
    }

    if (!apiKey || apiKey.trim() === '') {
      return { valid: false, error: 'API key is required' };
    }

    // Service-specific validation
    switch (serviceId) {
      case 'anthropic':
        if (!apiKey.startsWith('sk-ant-api03-')) {
          return { valid: false, error: 'Anthropic API keys should start with "sk-ant-api03-"' };
        }
        break;
      case 'openai':
        if (!apiKey.startsWith('sk-proj-') && !apiKey.startsWith('sk-')) {
          return { valid: false, error: 'OpenAI API keys should start with "sk-"' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Test API key connectivity (placeholder for future implementation)
   */
  async testAPIKey(serviceId: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    // This would implement actual API testing in the future
    const validation = this.validateAPIKey(serviceId, apiKey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    return { success: true };
  }

  /**
   * Check if a service is online
   */
  async checkServiceOnlineStatus(serviceId: string): Promise<boolean> {
    try {
      // Use dynamic import to avoid issues with fetch in Node.js
      const { net } = require('electron');
      
      // Simple connectivity check to the service's API endpoint
      const endpoints: { [key: string]: string } = {
        'anthropic': 'https://api.anthropic.com',
        'openai': 'https://api.openai.com',
        'github-copilot': 'https://api.github.com'
      };
      
      const endpoint = endpoints[serviceId];
      if (!endpoint) return false;
      
      return new Promise<boolean>((resolve) => {
        const request = net.request({
          method: 'HEAD',
          url: endpoint,
          timeout: 5000
        });
        
        request.on('response', (response: any) => {
          const isOnline = response.statusCode !== undefined;
          
          // Update service status
          const service = this.supportedServices.find(s => s.id === serviceId);
          if (service) {
            service.isOnline = isOnline;
            this.emit('service-online-status', serviceId, isOnline);
          }
          
          resolve(isOnline);
        });
        
        request.on('error', () => {
          const service = this.supportedServices.find(s => s.id === serviceId);
          if (service) {
            service.isOnline = false;
            this.emit('service-online-status', serviceId, false);
          }
          resolve(false);
        });
        
        request.end();
      });
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check online status for all services
   */
  async checkAllServicesOnlineStatus(): Promise<void> {
    const promises = this.supportedServices.map(service => 
      this.checkServiceOnlineStatus(service.id)
    );
    await Promise.all(promises);
  }

  /**
   * Reset all AI configuration (remove master key and all API keys)
   */
  async resetConfiguration(): Promise<void> {
    await this.cryptoService.removeMasterKey();
    this.supportedServices.forEach(service => {
      service.enabled = false;
      service.isOnline = undefined;
    });
    this.emit('configuration-reset');
  }
}