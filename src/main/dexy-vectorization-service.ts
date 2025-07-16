import { Task } from '../types/kanban';
import { VectorStorageService, VectorDocument } from '../main/vector-storage-service';
import { AIProvider } from '../types/ai-provider';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as https from 'https';
import { CentralizedAPIKeyService } from '../services/centralized-api-key-service';

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
    console.log('[DEXY] Initializing for project:', projectPath);
    this.projectPath = projectPath;
    this.vectorStorage = new VectorStorageService(projectPath);
    
    // Load Dexy configuration
    await this.loadDexyConfig();
    
    console.log('[DEXY] Config after loading:', this.config);
    
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
      
      // Load from ~/.labrats/config.yaml
      const configPath = path.join(os.homedir(), '.labrats', 'config.yaml');
      console.log('[DEXY] Loading config from:', configPath);
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const configData = yaml.load(configContent) as any;
        
        // Check for agent overrides in the YAML structure
        const dexyConfig = configData?.agents?.overrides?.dexy;
        const agentsConfig = configData?.agents;
        
        // Handle inheritance - use agent-specific config or fall back to defaults
        let providerId = dexyConfig?.provider;
        let modelId = dexyConfig?.model;
        
        // If provider or model is 'inherit', use the default values
        if (providerId === 'inherit' || !providerId) {
          providerId = agentsConfig?.defaultProvider || configData?.ai?.defaultProvider;
        }
        if (modelId === 'inherit' || !modelId) {
          modelId = agentsConfig?.defaultModel || configData?.ai?.defaultModel;
        }
        
        if (providerId && modelId) {
          this.config = {
            providerId,
            modelId
          };
          console.log('[DEXY] Loaded configuration from YAML:', this.config);
        } else {
          console.log('[DEXY] Could not determine provider/model from config:', { dexyConfig, providerId, modelId });
        }
      } else {
        console.warn('[DEXY] Config file not found at:', configPath);
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

    console.log('[DEXY] Vectorizing task:', task.id);

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
      console.warn('[DEXY] Cannot generate embedding - no provider or config');
      return null;
    }

    try {
      console.log('[DEXY] Generating embedding for text of length:', text.length);
      const response = await this.callEmbeddingAPI(text);
      if (response && response.length > 0) {
        console.log('[DEXY] Successfully generated embedding with', response.length, 'dimensions');
      } else {
        console.warn('[DEXY] Failed to generate embedding - empty response');
      }
      return response;
    } catch (error) {
      console.error('[DEXY] Failed to generate embedding:', error);
      return null;
    }
  }

  async callEmbeddingAPI(text: string): Promise<number[] | null> {
    if (!this.provider || !this.config) {
      return null;
    }

    try {
      // For OpenAI
      if (this.config.providerId === 'openai') {
        const apiKey = await this.getAPIKey();
        console.log('[DEXY] Calling OpenAI embeddings API with model:', this.config.modelId);
        
        // Use https module for Node.js compatibility
        const requestData = JSON.stringify({
          model: this.config.modelId,
          input: text
        });

        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.openai.com',
            path: '/v1/embeddings',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Length': Buffer.byteLength(requestData)
            }
          };

          const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (res.statusCode !== 200) {
                  console.error('[DEXY] OpenAI API error:', res.statusCode, parsed);
                  reject(new Error(`OpenAI API error: ${res.statusCode}`));
                } else {
                  const embedding = parsed.data?.[0]?.embedding || null;
                  console.log('[DEXY] Received embedding response, has embedding:', !!embedding);
                  resolve(embedding);
                }
              } catch (e) {
                console.error('[DEXY] Failed to parse API response:', e);
                reject(e);
              }
            });
          });

          req.on('error', (error: any) => {
            console.error('[DEXY] Request error:', error);
            reject(error);
          });

          req.write(requestData);
          req.end();
        });
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
      const centralizedService = CentralizedAPIKeyService.getInstance();
      
      console.log('[DEXY] Getting API key from centralized service for provider:', this.config.providerId);
      const apiKey = await centralizedService.getAPIKey(this.config.providerId);
      console.log('[DEXY] Successfully retrieved API key from centralized service');
      
      return apiKey;
    } catch (error) {
      console.error('[DEXY] Failed to get API key from centralized service:', error);
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

  async hasTaskVector(taskId: string): Promise<boolean> {
    if (!this.vectorStorage || !this.indexId) {
      return false;
    }

    try {
      return await this.vectorStorage.hasDocument(this.indexId, `task_${taskId}`);
    } catch (error) {
      console.error('[DEXY] Failed to check task vector:', error);
      return false;
    }
  }

  async getVectorizedTaskIds(): Promise<string[]> {
    if (!this.vectorStorage || !this.indexId) {
      console.warn('[DEXY] Cannot get vectorized task IDs - storage not initialized', {
        hasVectorStorage: !!this.vectorStorage,
        hasIndexId: !!this.indexId,
        indexId: this.indexId
      });
      return [];
    }

    try {
      const documentIds = await this.vectorStorage.getDocumentIds(this.indexId);
      console.log('[DEXY] Found document IDs:', documentIds);
      // Extract task IDs from document IDs (remove 'task_' prefix)
      const taskIds = documentIds
        .filter(id => id.startsWith('task_'))
        .map(id => id.substring(5));
      console.log('[DEXY] Extracted task IDs:', taskIds);
      return taskIds;
    } catch (error) {
      console.error('[DEXY] Failed to get vectorized task IDs:', error);
      return [];
    }
  }

  async syncTasks(tasks: Task[], boardId: string): Promise<void> {
    if (!this.isConfigured()) {
      console.log('[DEXY] Not configured, skipping sync');
      return;
    }

    try {
      console.log('[DEXY] Starting task sync with', tasks.length, 'tasks');
      
      // Ensure vector storage is initialized
      if (!this.vectorStorage || !this.indexId) {
        console.warn('[DEXY] Vector storage not initialized, cannot sync');
        return;
      }
      
      // Get all vectorized task IDs
      const vectorizedTaskIds = await this.getVectorizedTaskIds();
      const vectorizedSet = new Set(vectorizedTaskIds);
      
      console.log('[DEXY] Currently vectorized task IDs:', vectorizedTaskIds);
      
      // Get current task IDs
      const currentTaskIds = new Set(tasks.map(t => t.id));
      
      // Find tasks to vectorize (new tasks)
      const tasksToVectorize = tasks.filter(task => !vectorizedSet.has(task.id));
      
      // Find tasks to update (check if content changed)
      const tasksToUpdate: Task[] = [];
      for (const task of tasks) {
        if (vectorizedSet.has(task.id)) {
          // Check if task content has changed
          const existingDoc = await this.vectorStorage!.getDocument(this.indexId!, `task_${task.id}`);
          if (existingDoc) {
            const currentText = this.createTaskText(task);
            if (existingDoc.content !== currentText) {
              tasksToUpdate.push(task);
            }
          }
        }
      }
      
      // Find vectors to delete (tasks no longer exist)
      const vectorsToDelete = vectorizedTaskIds.filter(id => !currentTaskIds.has(id));
      
      console.log('[DEXY] Sync summary:', {
        total: tasks.length,
        vectorized: vectorizedTaskIds.length,
        toVectorize: tasksToVectorize.length,
        toUpdate: tasksToUpdate.length,
        toDelete: vectorsToDelete.length
      });
      
      // Process new tasks
      if (tasksToVectorize.length > 0) {
        console.log('[DEXY] Vectorizing', tasksToVectorize.length, 'new tasks...');
        for (const task of tasksToVectorize) {
          await this.vectorizeTask(task, boardId);
        }
      }
      
      // Process updated tasks
      if (tasksToUpdate.length > 0) {
        console.log('[DEXY] Updating', tasksToUpdate.length, 'changed tasks...');
        for (const task of tasksToUpdate) {
          await this.updateTaskVector(task, boardId);
        }
      }
      
      // Delete orphaned vectors
      if (vectorsToDelete.length > 0) {
        console.log('[DEXY] Deleting', vectorsToDelete.length, 'orphaned vectors...');
        for (const taskId of vectorsToDelete) {
          await this.deleteTaskVector(taskId);
        }
      }
      
      console.log('[DEXY] Sync completed');
    } catch (error) {
      console.error('[DEXY] Sync failed:', error);
    }
  }
}

// Export singleton instance getter
export function getDexyVectorizationService(): DexyVectorizationService {
  return DexyVectorizationService.getInstance();
}