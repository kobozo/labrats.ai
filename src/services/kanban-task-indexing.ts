/**
 * Kanban Task Indexing Service
 * Handles vectorization and indexing of kanban tasks for semantic search
 */

import { Task } from '../types/kanban';
import { VectorDocument, VectorSearchQuery } from '../types/vector-store';
import { vectorProviderManager } from './vector-provider-manager';
import { embeddingService } from './embedding-service';
import { kanbanService } from './kanban-service';

export interface TaskSearchResult {
  task: Task;
  score: number;
  highlights?: string[];
}

export class KanbanTaskIndexingService {
  private static instance: KanbanTaskIndexingService;
  private indexId: string = 'kanban-tasks';
  private embeddingProviderId: string = '';
  private embeddingModelId: string = '';
  private isInitialized: boolean = false;
  
  private constructor() {}
  
  static getInstance(): KanbanTaskIndexingService {
    if (!KanbanTaskIndexingService.instance) {
      KanbanTaskIndexingService.instance = new KanbanTaskIndexingService();
    }
    return KanbanTaskIndexingService.instance;
  }
  
  /**
   * Initialize the indexing service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Get embedding configuration
    if (typeof window !== 'undefined' && window.electronAPI?.config?.get) {
      this.embeddingProviderId = await window.electronAPI.config.get('vectorStore', 'embeddingProvider') || 'openai';
      this.embeddingModelId = await window.electronAPI.config.get('vectorStore', 'embeddingModel') || 'text-embedding-3-small';
    }
    
    // Get vector provider
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    // Ensure provider is initialized
    if (!provider.isInitialized) {
      const config = await vectorProviderManager.getProviderConfig(provider.id);
      if (config) {
        await provider.initialize(config);
      }
    }
    
    // Create index if it doesn't exist
    const indices = await provider.listIndices();
    const existingIndex = indices.find(idx => idx.name === this.indexId);
    
    if (!existingIndex) {
      // Get embedding dimensions from model
      const models = await embeddingService.getEmbeddingModels(this.embeddingProviderId);
      const model = models.find(m => m.id === this.embeddingModelId);
      const dimensions = model?.dimensions || 1536; // Default to OpenAI dimensions
      
      await provider.createIndex(this.indexId, dimensions, {
        description: 'Index for kanban task semantic search',
        embeddingProvider: this.embeddingProviderId,
        embeddingModel: this.embeddingModelId
      });
    }
    
    this.isInitialized = true;
  }
  
  /**
   * Convert a task to a vector document
   */
  private taskToDocument(task: Task): Omit<VectorDocument, 'embedding'> {
    // Combine relevant text fields for embedding
    const content = [
      `Title: ${task.title}`,
      `Description: ${task.description}`,
      `Type: ${task.type}`,
      `Priority: ${task.priority}`,
      `Status: ${task.status}`,
      `Assignee: ${task.assignee}`,
      task.returnReason ? `Return Reason: ${task.returnReason}` : '',
      task.acceptanceCriteria ? `Acceptance Criteria: ${task.acceptanceCriteria}` : '',
      task.tags?.length ? `Tags: ${task.tags.join(', ')}` : ''
    ].filter(Boolean).join('\n');
    
    return {
      id: task.id,
      content,
      metadata: {
        type: 'issue' as const, // Use a valid VectorMetadataType
        source: 'kanban',
        timestamp: new Date(),
        taskId: task.id,
        title: task.title,
        taskType: task.type,
        priority: task.priority,
        status: task.status,
        assignee: task.assignee,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        boardId: task.boardId || 'main-board',
        category: 'kanban-task'
      }
    };
  }
  
  /**
   * Index a single task
   */
  async indexTask(task: Task): Promise<void> {
    await this.initialize();
    
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    // Convert task to document
    const doc = this.taskToDocument(task);
    
    // Generate embedding
    const embeddingResult = await embeddingService.embedText(doc.content, {
      providerId: this.embeddingProviderId,
      modelId: this.embeddingModelId
    });
    
    // Create vector document
    const vectorDoc: VectorDocument = {
      ...doc,
      embedding: embeddingResult.embedding
    };
    
    // Upsert to vector store
    await provider.upsert(this.indexId, [vectorDoc]);
  }
  
  /**
   * Index multiple tasks (batch)
   */
  async indexTasks(tasks: Task[]): Promise<void> {
    await this.initialize();
    
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    // Convert tasks to documents
    const docs = tasks.map(task => this.taskToDocument(task));
    
    // Generate embeddings in batch
    const contents = docs.map(doc => doc.content);
    const embeddings = await embeddingService.embedBatch(contents, {
      providerId: this.embeddingProviderId,
      modelId: this.embeddingModelId
    });
    
    // Create vector documents
    const vectorDocs: VectorDocument[] = docs.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i].embedding
    }));
    
    // Upsert to vector store
    await provider.upsert(this.indexId, vectorDocs);
  }
  
  /**
   * Remove a task from the index
   */
  async removeTask(taskId: string): Promise<void> {
    await this.initialize();
    
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    await provider.delete(this.indexId, [taskId]);
  }
  
  /**
   * Search for similar tasks
   */
  async searchTasks(query: string, options?: {
    topK?: number;
    threshold?: number;
    filter?: Record<string, any>;
  }): Promise<TaskSearchResult[]> {
    await this.initialize();
    
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    // Generate embedding for query
    const embeddingResult = await embeddingService.embedText(query, {
      providerId: this.embeddingProviderId,
      modelId: this.embeddingModelId
    });
    
    // Create search query
    const searchQuery: VectorSearchQuery = {
      vector: embeddingResult.embedding,
      topK: options?.topK || 10,
      threshold: options?.threshold || 0.7,
      filter: options?.filter,
      includeMetadata: true
    };
    
    // Search vector store
    const results = await provider.search(this.indexId, searchQuery);
    
    // Fetch actual tasks
    const taskResults: TaskSearchResult[] = [];
    
    for (const result of results) {
      const taskId = result.document.metadata.taskId as string;
      const boardId = result.document.metadata.boardId as string || 'main-board';
      
      // Get all tasks and find the one we need
      const tasks = await kanbanService.getTasks(boardId);
      const task = tasks.find(t => t.id === taskId);
      
      if (task) {
        taskResults.push({
          task,
          score: result.score,
          highlights: this.generateHighlights(query, task)
        });
      }
    }
    
    return taskResults;
  }
  
  /**
   * Find potential duplicate tasks
   */
  async findDuplicates(task: Task, threshold: number = 0.85): Promise<TaskSearchResult[]> {
    // Search using the task title and description
    const query = `${task.title} ${task.description}`;
    
    const results = await this.searchTasks(query, {
      topK: 5,
      threshold,
      filter: {
        taskId: { $ne: task.id } // Exclude the task itself
      }
    });
    
    return results;
  }
  
  /**
   * Reindex all tasks from a board
   */
  async reindexBoard(boardId: string): Promise<void> {
    await this.initialize();
    
    // Get all tasks from the board
    const tasks = await kanbanService.getTasks(boardId);
    
    // Clear existing index for this board
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active vector provider');
    }
    
    // Get all documents from this board
    const allDocs = await provider.fetch(this.indexId, tasks.map(t => t.id));
    const boardTaskIds = allDocs
      .filter(doc => doc.metadata.boardId === boardId)
      .map(doc => doc.id);
    
    // Delete old entries
    if (boardTaskIds.length > 0) {
      await provider.delete(this.indexId, boardTaskIds);
    }
    
    // Reindex all tasks
    if (tasks.length > 0) {
      await this.indexTasks(tasks);
    }
  }
  
  /**
   * Generate text highlights for search results
   */
  private generateHighlights(query: string, task: Task): string[] {
    const highlights: string[] = [];
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);
    
    // Check title
    const titleLower = task.title.toLowerCase();
    if (words.some(word => titleLower.includes(word))) {
      highlights.push(task.title);
    }
    
    // Check description
    const descLower = task.description.toLowerCase();
    const sentences = task.description.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (words.some(word => sentence.toLowerCase().includes(word))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break; // Limit highlights
      }
    }
    
    return highlights;
  }
  
  /**
   * Get indexing statistics
   */
  async getStats(): Promise<{
    totalTasks: number;
    indexedTasks: number;
    lastIndexed?: Date;
  }> {
    await this.initialize();
    
    const provider = await vectorProviderManager.getActiveProvider();
    if (!provider) {
      return { totalTasks: 0, indexedTasks: 0 };
    }
    
    const stats = await provider.getIndexStats(this.indexId);
    
    // Get total tasks from kanban service
    const tasks = await kanbanService.getTasks('main-board');
    
    return {
      totalTasks: tasks.length,
      indexedTasks: stats.totalVectors || 0
    };
  }
}

// Export singleton instance
export const kanbanTaskIndexing = KanbanTaskIndexingService.getInstance();