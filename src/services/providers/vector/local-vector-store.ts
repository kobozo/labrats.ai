/**
 * Local Vector Store Implementation
 * Uses a simple in-memory approach with file-based persistence
 * For production, this would use HNSWLib or Faiss
 */

import * as fs from 'fs';
import * as path from 'path';
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

export class LocalVectorStore extends BaseVectorProvider {
  id = 'local';
  name = 'Local Vector Store';
  type: 'local' | 'cloud' = 'local';
  
  private indices: Map<string, LocalIndex> = new Map();
  private indexPath: string = '';
  
  async initialize(config: any): Promise<void> {
    await super.initialize(config);
    this.indexPath = config.indexPath || path.join(process.cwd(), '.labrats', 'vectors');
    
    // Ensure directory exists
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }
    
    // Load existing indices
    await this.loadIndices();
  }
  
  async testConnection(): Promise<boolean> {
    this.ensureInitialized();
    // For local store, just check if we can access the directory
    try {
      await fs.promises.access(this.indexPath, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
  
  async disconnect(): Promise<void> {
    // Save all indices before disconnecting
    await this.saveIndices();
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
    await this.saveIndex(index);
    
    return this.indexToVectorIndex(index);
  }
  
  async deleteIndex(indexId: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.indices.has(indexId)) {
      throw new VectorStoreError('Index not found', 'INDEX_NOT_FOUND');
    }
    
    this.indices.delete(indexId);
    
    // Delete from disk
    const indexFile = path.join(this.indexPath, `${indexId}.json`);
    if (fs.existsSync(indexFile)) {
      await fs.promises.unlink(indexFile);
    }
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
    await this.saveIndex(index);
    
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
    await this.saveIndex(index);
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
    await this.saveIndex(index);
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
    await this.saveIndex(index);
    
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
      diskUsage: await this.calculateDiskUsage()
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
  
  private async loadIndices(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.indexPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.promises.readFile(
            path.join(this.indexPath, file),
            'utf8'
          );
          const data = JSON.parse(content);
          
          const index: LocalIndex = {
            id: data.id,
            name: data.name,
            dimensions: data.dimensions,
            vectors: new Map(data.vectors.map((v: VectorDocument) => [v.id, v])),
            metadata: data.metadata,
            createdAt: new Date(data.createdAt),
            lastUpdated: new Date(data.lastUpdated)
          };
          
          this.indices.set(index.id, index);
        }
      }
    } catch (error) {
      console.error('Error loading indices:', error);
    }
  }
  
  private async saveIndices(): Promise<void> {
    for (const index of this.indices.values()) {
      await this.saveIndex(index);
    }
  }
  
  private async saveIndex(index: LocalIndex): Promise<void> {
    const data = {
      id: index.id,
      name: index.name,
      dimensions: index.dimensions,
      metadata: index.metadata,
      createdAt: index.createdAt.toISOString(),
      lastUpdated: index.lastUpdated.toISOString(),
      vectors: Array.from(index.vectors.values())
    };
    
    await fs.promises.writeFile(
      path.join(this.indexPath, `${index.id}.json`),
      JSON.stringify(data, null, 2)
    );
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
        stats[doc.metadata.type as keyof typeof stats]++;
      }
    }
    
    return stats;
  }
  
  private async calculateDiskUsage(): Promise<number> {
    let total = 0;
    
    try {
      const files = await fs.promises.readdir(this.indexPath);
      
      for (const file of files) {
        const stats = await fs.promises.stat(path.join(this.indexPath, file));
        total += stats.size;
      }
    } catch {
      // Ignore errors
    }
    
    return total;
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