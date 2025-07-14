/**
 * Vector Provider Interface
 * Defines the contract for vector store implementations
 */

import {
  VectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
  VectorIndex,
  VectorStoreStats,
  IndexOptions,
  VectorStoreConfig
} from './vector-store';

export interface VectorProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: VectorStoreConfig): Promise<void>;
  
  /**
   * Test connection to the vector store
   */
  testConnection(): Promise<boolean>;
  
  /**
   * Disconnect and cleanup resources
   */
  disconnect(): Promise<void>;
  
  // Index Management
  
  /**
   * Create a new vector index
   */
  createIndex(name: string, dimensions: number, metadata?: any): Promise<VectorIndex>;
  
  /**
   * Delete an index and all its vectors
   */
  deleteIndex(indexId: string): Promise<void>;
  
  /**
   * List all indices
   */
  listIndices(): Promise<VectorIndex[]>;
  
  /**
   * Get index information
   */
  getIndex(indexId: string): Promise<VectorIndex | null>;
  
  // Vector Operations
  
  /**
   * Insert or update vectors
   */
  upsert(indexId: string, documents: VectorDocument[]): Promise<string[]>;
  
  /**
   * Delete vectors by ID
   */
  delete(indexId: string, ids: string[]): Promise<void>;
  
  /**
   * Search for similar vectors
   */
  search(indexId: string, query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  
  /**
   * Get vectors by ID
   */
  fetch(indexId: string, ids: string[]): Promise<VectorDocument[]>;
  
  // Bulk Operations
  
  /**
   * Clear all vectors from an index
   */
  clearIndex(indexId: string): Promise<void>;
  
  /**
   * Export vectors from an index
   */
  exportIndex(indexId: string, format?: 'json' | 'parquet'): Promise<Blob>;
  
  /**
   * Import vectors to an index
   */
  importIndex(indexId: string, data: Blob | File): Promise<number>;
  
  // Statistics
  
  /**
   * Get provider-wide statistics
   */
  getStats(): Promise<VectorStoreStats>;
  
  /**
   * Get index-specific statistics
   */
  getIndexStats(indexId: string): Promise<Partial<VectorStoreStats>>;
}

/**
 * Factory for creating vector providers
 */
export interface VectorProviderFactory {
  createProvider(type: string, config?: VectorStoreConfig): VectorProvider;
  getSupportedProviders(): VectorProviderInfo[];
}

export interface VectorProviderInfo {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  description: string;
  features: string[];
  configSchema?: any; // JSON Schema for configuration
}

/**
 * Base class for vector providers
 */
export abstract class BaseVectorProvider implements VectorProvider {
  abstract id: string;
  abstract name: string;
  abstract type: 'local' | 'cloud';
  
  protected initialized = false;
  protected config?: VectorStoreConfig;
  
  async initialize(config: VectorStoreConfig): Promise<void> {
    this.config = config;
    this.initialized = true;
  }
  
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }
  }
  
  abstract testConnection(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract createIndex(name: string, dimensions: number, metadata?: any): Promise<VectorIndex>;
  abstract deleteIndex(indexId: string): Promise<void>;
  abstract listIndices(): Promise<VectorIndex[]>;
  abstract getIndex(indexId: string): Promise<VectorIndex | null>;
  abstract upsert(indexId: string, documents: VectorDocument[]): Promise<string[]>;
  abstract delete(indexId: string, ids: string[]): Promise<void>;
  abstract search(indexId: string, query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  abstract fetch(indexId: string, ids: string[]): Promise<VectorDocument[]>;
  abstract clearIndex(indexId: string): Promise<void>;
  abstract exportIndex(indexId: string, format?: 'json' | 'parquet'): Promise<Blob>;
  abstract importIndex(indexId: string, data: Blob | File): Promise<number>;
  abstract getStats(): Promise<VectorStoreStats>;
  abstract getIndexStats(indexId: string): Promise<Partial<VectorStoreStats>>;
}