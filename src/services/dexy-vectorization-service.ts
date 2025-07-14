import { Task } from '../types/kanban';
import { VectorStorageService, VectorDocument } from '../main/vector-storage-service';
import { AIProvider } from '../types/ai-provider';

export interface DexyConfig {
  providerId: string;
  modelId: string;
}

export class DexyVectorizationService {
  private static instance: DexyVectorizationService;
  private vectorStorage: VectorStorageService | null = null;
  private projectPath: string | null = null;
  private config: DexyConfig | null = null;
  private provider: AIProvider | null = null;
  private indexId: string | null = null;

  private constructor() {}

  static getInstance(): DexyVectorizationService {
    if (!DexyVectorizationService.instance) {
      DexyVectorizationService.instance = new DexyVectorizationService();
    }
    return DexyVectorizationService.instance;
  }

  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    this.vectorStorage = new VectorStorageService(projectPath);
    
    // Load Dexy configuration
    await this.loadDexyConfig();
    
    if (this.config && this.config.providerId && this.config.modelId) {
      // Initialize the embedding provider
      // Note: This service runs in the main process, so we need to get the provider differently
      // For now, we'll set the provider when calling the embedding API
      this.provider = { id: this.config.providerId } as AIProvider;
      
      if (this.provider) {
        // Get or create the kanban index
        const dimensions = await this.getEmbeddingDimensions();
        const index = await this.vectorStorage.getOrCreateKanbanIndex(
          this.config.providerId,
          this.config.modelId,
          dimensions
        );
        this.indexId = index.id;
        
        console.log('[DEXY] Initialized with:', {
          provider: this.config.providerId,
          model: this.config.modelId,
          dimensions,
          indexId: this.indexId
        });
      } else {
        console.warn('[DEXY] Provider not found:', this.config.providerId);
      }
    } else {
      console.warn('[DEXY] No valid configuration found. Dexy will not vectorize tasks.');
    }
  }

  private async loadDexyConfig(): Promise<void> {
    try {
      // Load Dexy agent configuration from the main process config
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');
      
      const configPath = path.join(app.getPath('userData'), 'config.json');
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const agentOverrides = configData?.agents?.overrides;
        const dexyConfig = agentOverrides?.dexy;
        
        if (dexyConfig && dexyConfig.provider !== 'inherit' && dexyConfig.model !== 'inherit') {
          this.config = {
            providerId: dexyConfig.provider,
            modelId: dexyConfig.model
          };
        }
      }
    } catch (error) {
      console.error('[DEXY] Failed to load configuration:', error);
    }
  }

  private async getEmbeddingDimensions(): Promise<number> {
    // Default dimensions for common embedding models
    const modelDimensions: { [key: string]: number } = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
      // Add more models as needed
    };

    if (this.config?.modelId && modelDimensions[this.config.modelId]) {
      return modelDimensions[this.config.modelId];
    }

    // Default to 1536 (common dimension)
    return 1536;
  }

  async vectorizeTask(task: Task, boardId: string): Promise<void> {
    if (!this.isConfigured()) {
      console.log('[DEXY] Not configured, skipping vectorization');
      return;
    }

    try {
      // Create text representation of the task
      const taskText = this.createTaskText(task);
      
      // Generate embedding
      const embedding = await this.generateEmbedding(taskText);
      
      if (!embedding || embedding.length === 0) {
        console.error('[DEXY] Failed to generate embedding for task:', task.id);
        return;
      }

      // Create vector document
      const document: VectorDocument = {
        id: `task_${task.id}`,
        content: taskText,
        metadata: {
          type: 'kanban-task',
          taskId: task.id,
          boardId: boardId,
          epicId: task.epicId,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
          createdAt: task.createdAt || new Date().toISOString(),
          updatedAt: task.updatedAt || new Date().toISOString(),
          title: task.title,
          tags: task.tags || []
        },
        embedding
      };

      // Save to vector storage
      if (this.vectorStorage && this.indexId) {
        await this.vectorStorage.addDocument(this.indexId, document);
        console.log('[DEXY] Vectorized task:', task.id);
      }
    } catch (error) {
      console.error('[DEXY] Failed to vectorize task:', error);
    }
  }

  async updateTaskVector(task: Task, boardId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      // Create updated text representation
      const taskText = this.createTaskText(task);
      
      // Generate new embedding
      const embedding = await this.generateEmbedding(taskText);
      
      if (!embedding || embedding.length === 0) {
        console.error('[DEXY] Failed to generate embedding for task update:', task.id);
        return;
      }

      // Update vector document
      const updates: Partial<VectorDocument> = {
        content: taskText,
        metadata: {
          type: 'kanban-task',
          taskId: task.id,
          boardId: boardId,
          epicId: task.epicId,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
          createdAt: task.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          title: task.title,
          tags: task.tags || []
        },
        embedding
      };

      if (this.vectorStorage && this.indexId) {
        await this.vectorStorage.updateDocument(this.indexId, `task_${task.id}`, updates);
        console.log('[DEXY] Updated task vector:', task.id);
      }
    } catch (error) {
      console.error('[DEXY] Failed to update task vector:', error);
    }
  }

  async deleteTaskVector(taskId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      if (this.vectorStorage && this.indexId) {
        await this.vectorStorage.deleteDocument(this.indexId, `task_${taskId}`);
        console.log('[DEXY] Deleted task vector:', taskId);
      }
    } catch (error) {
      console.error('[DEXY] Failed to delete task vector:', error);
    }
  }

  async findSimilarTasks(
    task: Task, 
    options: {
      topK?: number;
      threshold?: number;
      excludeTaskId?: string;
    } = {}
  ): Promise<Array<{ task: Task; similarity: number }>> {
    if (!this.isConfigured() || !this.vectorStorage || !this.indexId) {
      return [];
    }

    try {
      // Create text representation and generate embedding
      const taskText = this.createTaskText(task);
      const queryVector = await this.generateEmbedding(taskText);
      
      if (!queryVector || queryVector.length === 0) {
        console.error('[DEXY] Failed to generate query embedding');
        return [];
      }

      // Search for similar documents
      const results = await this.vectorStorage.searchSimilar(this.indexId, queryVector, {
        topK: options.topK || 5,
        threshold: options.threshold || 0.7,
        filter: (doc) => {
          // Filter out the current task if specified
          if (options.excludeTaskId && doc.metadata.taskId === options.excludeTaskId) {
            return false;
          }
          return doc.metadata.type === 'kanban-task';
        }
      });

      // Convert results back to tasks
      return results.map(result => ({
        task: {
          id: result.document.metadata.taskId!,
          title: result.document.metadata.title || '',
          description: result.document.content,
          status: result.document.metadata.status || 'todo',
          priority: result.document.metadata.priority,
          assignee: result.document.metadata.assignee,
          epicId: result.document.metadata.epicId,
          tags: result.document.metadata.tags || [],
          createdAt: result.document.metadata.createdAt,
          updatedAt: result.document.metadata.updatedAt
        } as Task,
        similarity: result.similarity
      }));
    } catch (error) {
      console.error('[DEXY] Failed to find similar tasks:', error);
      return [];
    }
  }

  private createTaskText(task: Task): string {
    const parts: string[] = [];
    
    // Add title
    if (task.title) {
      parts.push(`Title: ${task.title}`);
    }
    
    // Add description
    if (task.description) {
      parts.push(`Description: ${task.description}`);
    }
    
    // Add metadata
    if (task.status) {
      parts.push(`Status: ${task.status}`);
    }
    
    if (task.priority) {
      parts.push(`Priority: ${task.priority}`);
    }
    
    if (task.assignee) {
      parts.push(`Assignee: ${task.assignee}`);
    }
    
    if (task.tags && task.tags.length > 0) {
      parts.push(`Tags: ${task.tags.join(', ')}`);
    }
    
    // Add acceptance criteria if available
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      parts.push('Acceptance Criteria:');
      task.acceptanceCriteria.forEach((criterion, index) => {
        parts.push(`${index + 1}. ${criterion}`);
      });
    }
    
    return parts.join('\n');
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.provider || !this.config) {
      return null;
    }

    try {
      // Call the embedding API
      // This is a placeholder - actual implementation depends on provider's embedding API
      const response = await this.callEmbeddingAPI(text);
      return response;
    } catch (error) {
      console.error('[DEXY] Failed to generate embedding:', error);
      return null;
    }
  }

  private async callEmbeddingAPI(text: string): Promise<number[] | null> {
    if (!this.provider || !this.config) {
      return null;
    }

    try {
      // For OpenAI
      if (this.config.providerId === 'openai') {
        const apiKey = await this.getAPIKey();
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.config.modelId,
            input: text
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.data?.[0]?.embedding || null;
      }

      // Add support for other providers as needed
      console.warn('[DEXY] Embedding API not implemented for provider:', this.config.providerId);
      return null;
    } catch (error) {
      console.error('[DEXY] Embedding API call failed:', error);
      return null;
    }
  }

  private async getAPIKey(): Promise<string> {
    if (!this.config) {
      throw new Error('Dexy not configured');
    }

    try {
      // Get API key from the main process config service
      const { AIConfigService } = require('../main/aiConfigService');
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');
      
      // Read the encrypted API key from config
      const configPath = path.join(app.getPath('userData'), 'config.json');
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const serviceConfig = configData?.aiServices?.[this.config.providerId];
        
        if (serviceConfig?.apiKey) {
          // Decrypt the API key
          const aiConfigService = AIConfigService.getInstance();
          return await aiConfigService.getAPIKey(this.config.providerId, serviceConfig.apiKey);
        }
      }
      
      throw new Error(`No API key found for ${this.config.providerId}`);
    } catch (error) {
      console.error('[DEXY] Failed to get API key:', error);
      throw error;
    }
  }

  private isConfigured(): boolean {
    return !!(this.config && this.provider && this.vectorStorage && this.indexId);
  }

  isReady(): boolean {
    return this.isConfigured();
  }

  getConfig(): DexyConfig | null {
    return this.config;
  }
}

// Export singleton instance getter
export function getDexyVectorizationService(): DexyVectorizationService {
  return DexyVectorizationService.getInstance();
}