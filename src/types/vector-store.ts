/**
 * Vector Store Type Definitions
 * Defines interfaces for vector storage, search, and embedding providers
 */

export interface VectorStore {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  features: VectorStoreFeatures;
  status: 'connected' | 'disconnected' | 'error';
  config?: VectorStoreConfig;
}

export interface VectorStoreFeatures {
  maxDimensions: number;
  maxVectors?: number;
  supportsMetadata: boolean;
  supportsFiltering: boolean;
  supportsBatch: boolean;
  supportsHybridSearch: boolean;
  supportsDelete: boolean;
  supportsUpdate: boolean;
}

export interface VectorStoreConfig {
  // Local store config
  indexPath?: string;
  maxMemoryMb?: number;
  
  // Cloud store config
  apiKey?: string;
  environment?: string;
  endpoint?: string;
  namespace?: string;
}

export interface EmbeddingProvider {
  id: string;
  name: string;
  providerId: string; // References AI provider (openai, anthropic, etc)
  modelId: string;
  dimensions: number;
  maxTokens: number;
  costPer1kTokens?: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: VectorMetadata;
}

export interface VectorMetadata {
  source: string;
  type: 'code' | 'documentation' | 'conversation' | 'issue' | 'comment';
  timestamp: Date;
  projectPath?: string;
  filePath?: string;
  language?: string;
  startLine?: number;
  endLine?: number;
  author?: string;
  tags?: string[];
  [key: string]: any;
}

export interface VectorIndex {
  id: string;
  name: string;
  projectPath?: string; // Optional - can be global or project-specific
  vectorStore: string;
  embeddingProvider: string;
  dimensions: number;
  documentCount: number;
  size: number; // in bytes
  createdAt: Date;
  lastUpdated: Date;
  status: 'ready' | 'indexing' | 'error';
  stats?: IndexStats;
}

export interface IndexStats {
  code: number;
  documentation: number;
  conversations: number;
  issues: number;
  comments: number;
  total: number;
}

export interface VectorSearchQuery {
  query?: string; // Text query (will be embedded)
  vector?: number[]; // Direct vector query
  topK?: number;
  threshold?: number; // Similarity threshold
  filter?: Partial<VectorMetadata>;
  includeMetadata?: boolean;
  includeVectors?: boolean;
  hybridAlpha?: number; // 0 = pure vector, 1 = pure keyword
}

export interface VectorSearchResult {
  id: string;
  score: number;
  document: VectorDocument;
  highlights?: string[];
}

export interface IndexOptions {
  includeCode?: boolean;
  includeDocumentation?: boolean;
  includeConversations?: boolean;
  includeComments?: boolean;
  filePatterns?: string[];
  excludePatterns?: string[];
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface VectorStoreStats {
  totalVectors: number;
  totalIndices: number;
  memoryUsage?: number;
  diskUsage?: number;
  queryLatencyMs?: number;
  indexingRate?: number; // vectors per second
}

// Error types
export class VectorStoreError extends Error {
  constructor(
    message: string,
    public code: 'CONNECTION_FAILED' | 'INDEX_NOT_FOUND' | 'DIMENSION_MISMATCH' | 'QUOTA_EXCEEDED' | 'UNKNOWN',
    public details?: any
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}