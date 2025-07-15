# Vector Store Integration Proposal for LabRats.AI

## Overview

This proposal outlines the integration of a vector store system into LabRats.AI that allows for semantic search, code understanding, and enhanced AI context. The design follows existing architectural patterns while introducing modern vector search capabilities.

## Architecture Design

### 1. Core Types and Interfaces

```typescript
// src/types/vector-store.ts
export interface VectorStore {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  features: VectorStoreFeatures;
}

export interface VectorStoreFeatures {
  maxDimensions: number;
  supportsMetadata: boolean;
  supportsFiltering: boolean;
  supportsBatch: boolean;
  supportsHybridSearch: boolean;
}

export interface EmbeddingProvider {
  id: string;
  providerId: string; // References AI provider
  modelId: string;
  dimensions: number;
  maxTokens: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    type: 'code' | 'documentation' | 'conversation' | 'issue';
    timestamp: Date;
    projectPath?: string;
    filePath?: string;
    language?: string;
    [key: string]: any;
  };
}
```

### 2. Provider System

```typescript
// src/types/vector-provider.ts
export interface VectorProvider {
  id: string;
  name: string;
  initialize(config: VectorProviderConfig): Promise<void>;
  createIndex(name: string, config: IndexConfig): Promise<VectorIndex>;
  deleteIndex(name: string): Promise<void>;
  listIndices(): Promise<VectorIndex[]>;
  search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  upsert(documents: VectorDocument[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  getStats(): Promise<VectorStoreStats>;
}

// Local implementation using Faiss or HNSWLib
// src/services/providers/vector/local-vector-store.ts
export class LocalVectorStore implements VectorProvider {
  // Uses HNSWLib for efficient local vector search
  // Stores indices in .labrats/vectors/
}

// Cloud implementations
// src/services/providers/vector/pinecone.ts
// src/services/providers/vector/weaviate.ts
// src/services/providers/vector/qdrant.ts
```

### 3. Configuration Structure

```yaml
# .labrats/config.yaml
vectorStores:
  defaultStore: "local"
  defaultEmbeddingProvider: "openai"
  stores:
    local:
      type: "local"
      enabled: true
      settings:
        indexPath: ".labrats/vectors"
        maxMemory: "512MB"
    pinecone:
      type: "cloud"
      enabled: false
      apiKey: "encrypted_key"
      environment: "us-east-1"
  
  embeddingProviders:
    openai:
      provider: "openai"
      model: "text-embedding-3-small"
      dimensions: 1536
    anthropic:
      provider: "anthropic"
      model: "claude-3-embed"
      dimensions: 1024
    local:
      provider: "ollama"
      model: "nomic-embed-text"
      dimensions: 768
```

### 4. UI Design

#### Settings Page Addition

```typescript
// New section in Settings.tsx
const VectorStoreSettings = () => {
  return (
    <div className="space-y-6">
      {/* Vector Store Provider Selection */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Vector Store Provider</h3>
        <VectorStoreSelector
          value={selectedStore}
          onChange={setSelectedStore}
          showLocal={true}
        />
      </div>

      {/* Embedding Model Selection */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Embedding Model</h3>
        <div className="space-y-4">
          <ProviderModelSelector
            providers={embeddingProviders}
            selectedProvider={selectedEmbeddingProvider}
            selectedModel={selectedEmbeddingModel}
            onChange={(provider, model) => {
              setSelectedEmbeddingProvider(provider);
              setSelectedEmbeddingModel(model);
            }}
            label="Embedding Model"
            description="Model used to convert text to vectors"
          />
          <div className="text-sm text-gray-400">
            Dimensions: {getModelDimensions(selectedEmbeddingModel)}
          </div>
        </div>
      </div>

      {/* Index Management */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Vector Indices</h3>
        <IndexManager
          currentProject={currentFolder}
          vectorStore={selectedStore}
        />
      </div>
    </div>
  );
};
```

#### Modern Index Manager Component

```typescript
// src/renderer/components/vector/IndexManager.tsx
const IndexManager = ({ currentProject, vectorStore }) => {
  return (
    <div className="space-y-4">
      {/* Index List */}
      <div className="grid gap-3">
        {indices.map(index => (
          <div key={index.id} className="bg-gray-700 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-white">{index.name}</h4>
                <p className="text-sm text-gray-400 mt-1">
                  {index.documentCount.toLocaleString()} documents • 
                  {formatBytes(index.size)} • 
                  Last updated {formatRelativeTime(index.lastUpdated)}
                </p>
              </div>
              <div className="flex space-x-2">
                <button className="text-blue-400 hover:text-blue-300">
                  <Search className="w-4 h-4" />
                </button>
                <button className="text-green-400 hover:text-green-300">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex space-x-4 text-xs text-gray-500">
              <span>Code: {index.stats.code}</span>
              <span>Docs: {index.stats.documentation}</span>
              <span>Chats: {index.stats.conversations}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create New Index */}
      <button
        onClick={() => setShowCreateDialog(true)}
        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
      >
        <Plus className="w-5 h-5 mx-auto mb-1" />
        Create New Index
      </button>
    </div>
  );
};
```

### 5. Integration Points

#### A. Code Indexing Service

```typescript
// src/services/code-indexer.ts
export class CodeIndexer {
  async indexProject(projectPath: string, options: IndexOptions) {
    // 1. Walk project files
    // 2. Extract code chunks with context
    // 3. Generate embeddings
    // 4. Store in vector index
  }

  async indexFile(filePath: string) {
    // Index individual file on save
  }
}
```

#### B. Enhanced Chat Context

```typescript
// Integration with agent-message-bus.ts
class AgentMessageBus {
  async getEnhancedContext(message: string): Promise<Context> {
    // 1. Generate embedding for user message
    const embedding = await this.embeddingService.embed(message);
    
    // 2. Search vector store
    const relevantDocs = await this.vectorStore.search({
      vector: embedding,
      topK: 5,
      filter: { projectPath: this.currentProject }
    });
    
    // 3. Return enhanced context
    return {
      relevantCode: relevantDocs.filter(d => d.metadata.type === 'code'),
      relevantDocs: relevantDocs.filter(d => d.metadata.type === 'documentation'),
      conversationHistory: relevantDocs.filter(d => d.metadata.type === 'conversation')
    };
  }
}
```

#### C. Smart Search Component

```typescript
// src/renderer/components/SmartSearch.tsx
const SmartSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<'semantic' | 'hybrid' | 'exact'>('hybrid');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Search Input */}
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, docs, or conversations..."
            className="w-full px-4 py-2 bg-gray-700 rounded-lg"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {results.map(result => (
            <SearchResultItem
              key={result.id}
              result={result}
              onClick={() => navigateToResult(result)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
```

### 6. Implementation Phases

#### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create type definitions
- [ ] Implement vector provider manager
- [ ] Create local vector store using HNSWLib
- [ ] Add configuration support

#### Phase 2: Embedding Integration (Week 2-3)
- [ ] Create embedding service
- [ ] Integrate with existing AI providers
- [ ] Add embedding model configuration UI
- [ ] Implement caching layer

#### Phase 3: Indexing Services (Week 3-4)
- [ ] Code indexer with AST parsing
- [ ] Documentation indexer
- [ ] Conversation history indexer
- [ ] Incremental indexing support

#### Phase 4: UI Components (Week 4-5)
- [ ] Vector store settings page
- [ ] Index management UI
- [ ] Smart search interface
- [ ] Context visualization

#### Phase 5: Agent Integration (Week 5-6)
- [ ] Enhance agent message bus
- [ ] Add retrieval to agent context
- [ ] Create vector-aware agents
- [ ] Performance optimization

### 7. Technical Considerations

#### Local Vector Store Options
1. **HNSWLib** - Fast, memory-efficient, good for up to 1M vectors
2. **Faiss** - More features but larger binary size
3. **SQLite with vector extension** - Simpler but less performant

#### Performance Optimizations
- Lazy loading of indices
- Background indexing with progress UI
- Incremental updates on file changes
- Embedding cache with LRU eviction

#### Security Considerations
- Encrypt vector indices at rest
- Sanitize metadata before storage
- Respect .gitignore for indexing
- API key encryption for cloud providers

### 8. Benefits

1. **Enhanced Code Understanding**: Agents can find relevant code across the entire codebase
2. **Improved Context**: Better responses based on project-specific knowledge
3. **Semantic Search**: Find code by meaning, not just keywords
4. **Knowledge Persistence**: Maintain project knowledge across sessions
5. **Multi-Modal Search**: Search code, docs, and conversations in one place

This design provides a modern, extensible vector store system that integrates seamlessly with LabRats.AI's existing architecture while providing powerful new capabilities for semantic search and AI-enhanced development.