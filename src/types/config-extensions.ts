/**
 * Configuration extensions for vector stores
 * This extends the main LabRatsConfig interface
 */

import { VectorStoreConfig } from './vector-store';

export interface VectorStoreSettings {
  defaultStore: string;
  defaultEmbeddingProvider: string;
  
  stores: {
    [storeId: string]: {
      type: 'local' | 'cloud';
      enabled: boolean;
      config?: VectorStoreConfig;
    };
  };
  
  embeddingProviders: {
    [providerId: string]: {
      provider: string; // AI provider ID (openai, anthropic, etc)
      model: string;
      dimensions: number;
      enabled: boolean;
    };
  };
  
  indexing: {
    autoIndex: boolean;
    indexOnSave: boolean;
    excludePatterns: string[];
    chunkSize: number;
    chunkOverlap: number;
  };
}

// This will be merged into LabRatsConfig
export interface ExtendedLabRatsConfig {
  vectorStores: VectorStoreSettings;
}