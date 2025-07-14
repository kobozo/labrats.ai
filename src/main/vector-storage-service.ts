import * as fs from 'fs';
import * as path from 'path';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    type: 'kanban-task' | 'chat-message' | 'code-snippet' | 'document';
    taskId?: string;
    boardId?: string;
    epicId?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    createdAt: string;
    updatedAt: string;
    [key: string]: any;
  };
  embedding?: number[];
}

export interface VectorIndex {
  id: string;
  name: string;
  dimensions: number;
  documents: Map<string, VectorDocument>;
  metadata: {
    embeddingProvider: string;
    embeddingModel: string;
    createdAt: string;
    updatedAt: string;
  };
}

export class VectorStorageService {
  private projectPath: string;
  private indices: Map<string, VectorIndex> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.ensureVectorDirectories();
    this.loadIndices();
  }

  private ensureVectorDirectories(): void {
    const vectorsPath = path.join(this.projectPath, '.labrats', 'vectors');
    const indicesPath = path.join(vectorsPath, 'indices');
    const embeddingsPath = path.join(vectorsPath, 'embeddings');
    
    if (!fs.existsSync(vectorsPath)) {
      fs.mkdirSync(vectorsPath, { recursive: true });
    }
    if (!fs.existsSync(indicesPath)) {
      fs.mkdirSync(indicesPath, { recursive: true });
    }
    if (!fs.existsSync(embeddingsPath)) {
      fs.mkdirSync(embeddingsPath, { recursive: true });
    }
  }

  private getIndicesPath(): string {
    return path.join(this.projectPath, '.labrats', 'vectors', 'indices');
  }

  private getEmbeddingsPath(): string {
    return path.join(this.projectPath, '.labrats', 'vectors', 'embeddings');
  }

  private getIndexFilePath(indexId: string): string {
    return path.join(this.getIndicesPath(), `${indexId}.json`);
  }

  private getEmbeddingFilePath(indexId: string, documentId: string): string {
    const indexPath = path.join(this.getEmbeddingsPath(), indexId);
    if (!fs.existsSync(indexPath)) {
      fs.mkdirSync(indexPath, { recursive: true });
    }
    return path.join(indexPath, `${documentId}.json`);
  }

  private async loadIndices(): Promise<void> {
    try {
      const indicesPath = this.getIndicesPath();
      if (!fs.existsSync(indicesPath)) {
        return;
      }

      const files = await fs.promises.readdir(indicesPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const indexId = file.replace('.json', '');
          await this.loadIndex(indexId);
        }
      }
    } catch (error) {
      console.error('[VECTOR-STORAGE] Failed to load indices:', error);
    }
  }

  private async loadIndex(indexId: string): Promise<VectorIndex | null> {
    try {
      const indexPath = this.getIndexFilePath(indexId);
      const data = await fs.promises.readFile(indexPath, 'utf8');
      const indexData = JSON.parse(data);
      
      // Convert documents array back to Map
      const documents = new Map<string, VectorDocument>();
      if (indexData.documents && Array.isArray(indexData.documents)) {
        for (const doc of indexData.documents) {
          // Load embedding separately
          const embeddingPath = this.getEmbeddingFilePath(indexId, doc.id);
          if (fs.existsSync(embeddingPath)) {
            const embeddingData = await fs.promises.readFile(embeddingPath, 'utf8');
            doc.embedding = JSON.parse(embeddingData);
          }
          documents.set(doc.id, doc);
        }
      }

      const index: VectorIndex = {
        ...indexData,
        documents
      };

      this.indices.set(indexId, index);
      return index;
    } catch (error) {
      console.error(`[VECTOR-STORAGE] Failed to load index ${indexId}:`, error);
      return null;
    }
  }

  async createIndex(name: string, dimensions: number, embeddingProvider: string, embeddingModel: string): Promise<VectorIndex> {
    const indexId = `idx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const index: VectorIndex = {
      id: indexId,
      name,
      dimensions,
      documents: new Map(),
      metadata: {
        embeddingProvider,
        embeddingModel,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    this.indices.set(indexId, index);
    await this.saveIndex(index);
    return index;
  }

  async saveIndex(index: VectorIndex): Promise<void> {
    try {
      // Convert Map to array for JSON serialization (without embeddings)
      const indexData = {
        ...index,
        documents: Array.from(index.documents.values()).map(doc => {
          const { embedding, ...docWithoutEmbedding } = doc;
          return docWithoutEmbedding;
        })
      };

      const indexPath = this.getIndexFilePath(index.id);
      await fs.promises.writeFile(indexPath, JSON.stringify(indexData, null, 2));

      // Save embeddings separately
      for (const [docId, doc] of index.documents) {
        if (doc.embedding) {
          const embeddingPath = this.getEmbeddingFilePath(index.id, docId);
          await fs.promises.writeFile(embeddingPath, JSON.stringify(doc.embedding));
        }
      }
    } catch (error) {
      console.error(`[VECTOR-STORAGE] Failed to save index ${index.id}:`, error);
      throw error;
    }
  }

  async addDocument(indexId: string, document: VectorDocument): Promise<void> {
    const index = this.indices.get(indexId);
    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    // Validate embedding dimensions if provided
    if (document.embedding && document.embedding.length !== index.dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${index.dimensions}, got ${document.embedding.length}`);
    }

    index.documents.set(document.id, document);
    index.metadata.updatedAt = new Date().toISOString();
    
    await this.saveIndex(index);
  }

  async updateDocument(indexId: string, documentId: string, updates: Partial<VectorDocument>): Promise<void> {
    const index = this.indices.get(indexId);
    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    const existingDoc = index.documents.get(documentId);
    if (!existingDoc) {
      throw new Error(`Document ${documentId} not found in index ${indexId}`);
    }

    const updatedDoc = {
      ...existingDoc,
      ...updates,
      id: documentId, // Ensure ID doesn't change
      metadata: {
        ...existingDoc.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString()
      }
    };

    index.documents.set(documentId, updatedDoc);
    index.metadata.updatedAt = new Date().toISOString();
    
    await this.saveIndex(index);
  }

  async deleteDocument(indexId: string, documentId: string): Promise<void> {
    const index = this.indices.get(indexId);
    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    index.documents.delete(documentId);
    index.metadata.updatedAt = new Date().toISOString();
    
    // Delete embedding file
    const embeddingPath = this.getEmbeddingFilePath(indexId, documentId);
    if (fs.existsSync(embeddingPath)) {
      await fs.promises.unlink(embeddingPath);
    }
    
    await this.saveIndex(index);
  }

  async hasDocument(indexId: string, documentId: string): Promise<boolean> {
    const index = this.indices.get(indexId);
    if (!index) {
      return false;
    }
    
    return index.documents.has(documentId);
  }

  async getDocumentIds(indexId: string): Promise<string[]> {
    const index = this.indices.get(indexId);
    if (!index) {
      return [];
    }
    
    return Array.from(index.documents.keys());
  }

  async getDocument(indexId: string, documentId: string): Promise<VectorDocument | null> {
    const index = this.indices.get(indexId);
    if (!index) {
      return null;
    }
    
    const doc = index.documents.get(documentId);
    if (!doc) {
      return null;
    }
    
    // Load embedding if not already loaded
    if (!doc.embedding || doc.embedding.length === 0) {
      const embeddingPath = this.getEmbeddingFilePath(indexId, documentId);
      if (fs.existsSync(embeddingPath)) {
        const embedding = JSON.parse(await fs.promises.readFile(embeddingPath, 'utf-8'));
        doc.embedding = embedding;
      }
    }
    
    return doc;
  }

  async searchSimilar(
    indexId: string, 
    queryVector: number[], 
    options: {
      topK?: number;
      threshold?: number;
      filter?: (doc: VectorDocument) => boolean;
    } = {}
  ): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    const index = this.indices.get(indexId);
    if (!index) {
      throw new Error(`Index ${indexId} not found`);
    }

    const { topK = 10, threshold = 0.0, filter } = options;
    const results: Array<{ document: VectorDocument; similarity: number }> = [];

    for (const [_, doc] of index.documents) {
      if (!doc.embedding) continue;
      if (filter && !filter(doc)) continue;

      const similarity = this.cosineSimilarity(queryVector, doc.embedding);
      if (similarity >= threshold) {
        results.push({ document: doc, similarity });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
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

  getIndex(indexId: string): VectorIndex | undefined {
    return this.indices.get(indexId);
  }

  getAllIndices(): VectorIndex[] {
    return Array.from(this.indices.values());
  }

  async deleteIndex(indexId: string): Promise<void> {
    const index = this.indices.get(indexId);
    if (!index) {
      return;
    }

    // Delete index file
    const indexPath = this.getIndexFilePath(indexId);
    if (fs.existsSync(indexPath)) {
      await fs.promises.unlink(indexPath);
    }

    // Delete embeddings directory
    const embeddingsPath = path.join(this.getEmbeddingsPath(), indexId);
    if (fs.existsSync(embeddingsPath)) {
      await fs.promises.rm(embeddingsPath, { recursive: true, force: true });
    }

    this.indices.delete(indexId);
  }

  // Get or create the default kanban tasks index
  async getOrCreateKanbanIndex(embeddingProvider: string, embeddingModel: string, dimensions: number): Promise<VectorIndex> {
    // Look for existing kanban index
    for (const index of this.indices.values()) {
      if (index.name === 'kanban-tasks' && 
          index.metadata.embeddingProvider === embeddingProvider &&
          index.metadata.embeddingModel === embeddingModel &&
          index.dimensions === dimensions) {
        return index;
      }
    }

    // Create new index
    return await this.createIndex('kanban-tasks', dimensions, embeddingProvider, embeddingModel);
  }
}