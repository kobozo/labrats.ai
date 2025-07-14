/**
 * Browser-Compatible Local Vector Store Implementation
 * Uses in-memory storage with potential IndexedDB persistence
 */

import {
  VectorStore,
  VectorDocument,
  VectorSearchQuery,
  VectorSearchResult,
  VectorIndex,
  VectorStoreStats,
  VectorStoreError
} from '../../../types/vector-store';
import { BaseVectorProvider } from '../../../types/vector-provider';

interface LocalIndex {
  id: string;
  name: string;
  dimensions: number;
  vectors: Map<string, VectorDocument>;
  metadata: any;
  createdAt: Date;
  lastUpdated: Date;
}

export class BrowserLocalVectorStore extends BaseVectorProvider {
  id = 'local';
  name = 'Local Vector Store';
  type: 'local' | 'cloud' = 'local';
  
  private indices: Map<string, LocalIndex> = new Map();
  
  async initialize(config: any): Promise<void> {
    await super.initialize(config);
    // Load from localStorage if available
    this.loadFromStorage();
  }
  
  async testConnection(): Promise<boolean> {
    this.ensureInitialized();
    // For local browser store, always return true
    return true;
  }
  
  async disconnect(): Promise<void> {
    // Save to storage before disconnecting
    this.saveToStorage();
    this.indices.clear();
  }
  
  async createIndex(name: string, dimensions: number, metadata?: any): Promise<VectorIndex> {
    this.ensureInitialized();
    
    const id = `idx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const index: LocalIndex = {
      id,
      name,
      dimensions,
      vectors: new Map(),
      metadata: metadata || {},
      createdAt: new Date(),
      lastUpdated: new Date()
    };
    
    this.indices.set(id, index);
    this.saveToStorage();
    
    return this.indexToVectorIndex(index);
  }
  
  async deleteIndex(indexId: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.indices.has(indexId)) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    this.indices.delete(indexId);
    this.saveToStorage();
  }
  
  async listIndices(): Promise<VectorIndex[]> {
    this.ensureInitialized();
    return Array.from(this.indices.values()).map(index => this.indexToVectorIndex(index));
  }
  
  async getIndex(indexId: string): Promise<VectorIndex | null> {
    this.ensureInitialized();
    const index = this.indices.get(indexId);
    return index ? this.indexToVectorIndex(index) : null;
  }
  
  async upsert(indexId: string, documents: VectorDocument[]): Promise<string[]> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    const ids: string[] = [];
    
    for (const doc of documents) {
      // Validate dimensions
      if (doc.embedding && doc.embedding.length !== index.dimensions) {
        throw new VectorStoreError(
          `Dimension mismatch: expected ${index.dimensions}, got ${doc.embedding.length}`,
          'DIMENSION_MISMATCH'
        );
      }
      
      index.vectors.set(doc.id, doc);
      ids.push(doc.id);
    }
    
    index.lastUpdated = new Date();
    this.saveToStorage();
    
    return ids;
  }
  
  async delete(indexId: string, ids: string[]): Promise<void> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    for (const id of ids) {
      index.vectors.delete(id);
    }
    
    index.lastUpdated = new Date();
    this.saveToStorage();
  }
  
  async search(indexId: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    const queryVector = query.vector;
    if (!queryVector) {
      throw new VectorStoreError('Vector search requires a vector', 'UNKNOWN');
    }
    
    // Calculate similarities
    const results: VectorSearchResult[] = [];
    
    for (const [id, doc] of index.vectors) {
      if (!doc.embedding) continue;
      
      // Apply metadata filters
      if (query.filter) {
        let matches = true;
        for (const [key, value] of Object.entries(query.filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }
      
      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(queryVector, doc.embedding);
      
      // Apply threshold
      if (query.threshold && similarity < query.threshold) continue;
      
      results.push({
        id: doc.id,
        score: similarity,
        document: query.includeMetadata === false ? { ...doc, metadata: {} as any } : doc
      });
    }
    
    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.topK || 10);
  }
  
  async fetch(indexId: string, ids: string[]): Promise<VectorDocument[]> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    const documents: VectorDocument[] = [];
    for (const id of ids) {
      const doc = index.vectors.get(id);
      if (doc) {
        documents.push(doc);
      }
    }
    
    return documents;
  }
  
  async clearIndex(indexId: string): Promise<void> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    index.vectors.clear();
    index.lastUpdated = new Date();
    this.saveToStorage();
  }
  
  async exportIndex(indexId: string, format?: 'json' | 'parquet'): Promise<Blob> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    // For now, only support JSON export
    const data = {
      index: {
        id: index.id,
        name: index.name,
        dimensions: index.dimensions,
        metadata: index.metadata,
        createdAt: index.createdAt,
        lastUpdated: index.lastUpdated
      },
      vectors: Array.from(index.vectors.values())
    };
    
    const json = JSON.stringify(data, null, 2);
    return new Blob([json], { type: 'application/json' });
  }
  
  async importIndex(indexId: string, data: Blob | File): Promise<number> {
    this.ensureInitialized();
    
    const text = await data.text();
    const imported = JSON.parse(text);
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    let count = 0;
    for (const vector of imported.vectors) {
      index.vectors.set(vector.id, vector);
      count++;
    }
    
    index.lastUpdated = new Date();
    this.saveToStorage();
    
    return count;
  }
  
  async getStats(): Promise<VectorStoreStats> {
    this.ensureInitialized();
    
    let totalVectors = 0;
    let totalSize = 0;
    
    for (const index of this.indices.values()) {
      totalVectors += index.vectors.size;
      // Rough estimate of memory usage
      totalSize += index.vectors.size * index.dimensions * 4; // 4 bytes per float
    }
    
    return {
      totalVectors,
      totalIndices: this.indices.size,
      memoryUsage: totalSize,
      diskUsage: this.calculateStorageUsage()
    };
  }
  
  async getIndexStats(indexId: string): Promise<Partial<VectorStoreStats>> {
    this.ensureInitialized();
    
    const index = this.indices.get(indexId);
    if (!index) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    return {
      totalVectors: index.vectors.size,
      memoryUsage: index.vectors.size * index.dimensions * 4
    };
  }
  
  // Helper methods
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('labrats_vector_indices');
      if (stored) {
        const data = JSON.parse(stored);
        for (const indexData of data) {
          const index: LocalIndex = {
            id: indexData.id,
            name: indexData.name,
            dimensions: indexData.dimensions,
            vectors: new Map(indexData.vectors.map((v: VectorDocument) => [v.id, v])),
            metadata: indexData.metadata,
            createdAt: new Date(indexData.createdAt),
            lastUpdated: new Date(indexData.lastUpdated)
          };
          this.indices.set(index.id, index);
        }
      }
    } catch (error) {
      console.error('Error loading vector indices from storage:', error);
    }
  }
  
  private saveToStorage(): void {
    try {
      const data = Array.from(this.indices.values()).map(index => ({
        id: index.id,
        name: index.name,
        dimensions: index.dimensions,
        metadata: index.metadata,
        createdAt: index.createdAt.toISOString(),
        lastUpdated: index.lastUpdated.toISOString(),
        vectors: Array.from(index.vectors.values())
      }));
      
      localStorage.setItem('labrats_vector_indices', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving vector indices to storage:', error);
    }
  }
  
  private indexToVectorIndex(index: LocalIndex): VectorIndex {
    return {
      id: index.id,
      name: index.name,
      vectorStore: this.id,
      embeddingProvider: index.metadata.embeddingProvider || 'unknown',
      dimensions: index.dimensions,
      documentCount: index.vectors.size,
      size: index.vectors.size * index.dimensions * 4, // Rough estimate
      createdAt: index.createdAt,
      lastUpdated: index.lastUpdated,
      status: 'ready',
      stats: this.calculateIndexStats(index)
    };
  }
  
  private calculateIndexStats(index: LocalIndex): any {
    const stats = {
      code: 0,
      documentation: 0,
      conversations: 0,
      issues: 0,
      comments: 0,
      total: index.vectors.size
    };
    
    for (const doc of index.vectors.values()) {
      if (doc.metadata.type) {
        const type = doc.metadata.type as keyof typeof stats;
        if (type in stats && type !== 'total') {
          stats[type]++;
        }
      }
    }
    
    return stats;
  }
  
  private calculateStorageUsage(): number {
    try {
      const stored = localStorage.getItem('labrats_vector_indices');
      return stored ? stored.length : 0;
    } catch {
      return 0;
    }
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (normA * normB);
  }
}