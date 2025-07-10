export interface DecisionRequest {
  agentId: string;
  agentName: string;
  agentTitle: string;
  message: string;
  messageAuthor: string;
  conversationContext: string;
  agentRecentMessages: string;
}

export interface DecisionResponse {
  success: boolean;
  shouldRespond: boolean;
  reasoning?: string;
  error?: string;
}

export class LabRatsBackendService {
  private backendUrl: string;
  private model: string;
  private timeout: number;
  private isAvailable: boolean = false;
  private statusListeners: Set<(isOnline: boolean) => void> = new Set();
  private statusCheckInterval: NodeJS.Timeout | null = null;

  constructor(backendUrl?: string, model?: string, timeout?: number) {
    // Default values or from config
    this.backendUrl = backendUrl || 'http://localhost:11434';
    this.model = model || 'mistral';
    this.timeout = timeout || 30000;
    // Don't check availability in constructor - make it explicit
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.backendUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        // Check if the specified model is available
        const hasModel = data.models?.some((model: any) => {
          const modelName = model.name || model.model || '';
          const normalizedModelName = modelName.toLowerCase();
          const normalizedSearchModel = this.model.toLowerCase();
          
          // Check exact match or base model name match
          return normalizedModelName === normalizedSearchModel || 
                 normalizedModelName.includes(normalizedSearchModel.split(':')[0]);
        });
        
        if (hasModel) {
          this.isAvailable = true;
          console.log(`[LABRATS-BACKEND] Ollama backend with ${this.model} is available`);
        } else {
          console.warn(`[LABRATS-BACKEND] Ollama is running but ${this.model} model not found`);
        }
      }
    } catch (error) {
      console.warn('[LABRATS-BACKEND] Backend not available, falling back to external AI for decisions');
      this.isAvailable = false;
    }
  }

  async shouldAgentRespond(request: DecisionRequest): Promise<DecisionResponse> {
    console.log(`[LABRATS-BACKEND-DECISION] 🤔 Making decision for agent ${request.agentName} on message: "${request.message.substring(0, 50)}..."`);
    
    if (!this.isAvailable) {
      console.log(`[LABRATS-BACKEND-DECISION] ❌ Backend not available for ${request.agentName} decision`);
      return {
        success: false,
        shouldRespond: false, // No fallback - backend must be available
        error: 'LabRats backend not available - cannot make agent decisions'
      };
    }

    try {
      const decisionPrompt = this.buildDecisionPrompt(request);
      console.log(`[LABRATS-BACKEND-DECISION] 📤 Sending decision request to backend for ${request.agentName}`);
      
      const response = await fetch(`${this.backendUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: decisionPrompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 10
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.response?.toLowerCase().trim() || '';
      
      // Parse the response - look for YES/NO
      const shouldRespond = responseText.includes('yes') || responseText.startsWith('y');
      
      console.log(`[LABRATS-BACKEND-DECISION] 📥 Backend decision for ${request.agentName}: ${shouldRespond ? 'YES' : 'NO'} (raw: "${responseText}")`);
      
      return {
        success: true,
        shouldRespond,
        reasoning: responseText
      };

    } catch (error) {
      console.error('[LABRATS-BACKEND] Error in decision request:', error);
      return {
        success: false,
        shouldRespond: true, // Default to true on error
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildDecisionPrompt(request: DecisionRequest): string {
    return `You are a decision system determining if an AI agent should respond to a team message.

AGENT: ${request.agentName} (${request.agentTitle})
MESSAGE: "${request.message}"
AUTHOR: ${request.messageAuthor}

DECISION RULES:
1. RESPOND "YES" ONLY IF:
   - Agent is directly mentioned (@${request.agentId})
   - Message specifically requires their expertise
   - User asks for introductions AND agent hasn't introduced themselves yet
   - There's actual work that needs their specific skills

2. RESPOND "NO" IF:
   - Simple greetings or social messages
   - Other agents already handled the request
   - Agent has nothing meaningful to contribute
   - Would just be participating to participate

RECENT CONTEXT:
${request.conversationContext}

AGENT'S RECENT ACTIVITY:
${request.agentRecentMessages || 'None'}

Decision (respond ONLY with "YES" or "NO"):`;
  }

  get available(): boolean {
    return this.isAvailable;
  }

  async ensureAvailable(): Promise<void> {
    await this.checkAvailability();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.checkAvailability();
      return { success: this.isAvailable };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Subscribe to status changes
  onStatusChange(listener: (isOnline: boolean) => void): () => void {
    this.statusListeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  // Start periodic health checks
  startHealthChecks(intervalMs: number = 10000): void {
    // Stop any existing checks
    this.stopHealthChecks();
    
    // Initial check
    this.checkAvailability().then(() => {
      this.notifyStatusListeners();
    });
    
    // Set up periodic checks
    this.statusCheckInterval = setInterval(async () => {
      const wasAvailable = this.isAvailable;
      await this.checkAvailability();
      
      // Only notify if status changed
      if (wasAvailable !== this.isAvailable) {
        this.notifyStatusListeners();
      }
    }, intervalMs);
  }

  // Stop health checks
  stopHealthChecks(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }

  private notifyStatusListeners(): void {
    this.statusListeners.forEach(listener => {
      try {
        listener(this.isAvailable);
      } catch (error) {
        console.error('[LABRATS-BACKEND] Error in status listener:', error);
      }
    });
  }
}

// Singleton instance
let labRatsBackendInstance: LabRatsBackendService | null = null;

export async function getLabRatsBackendAsync(): Promise<LabRatsBackendService> {
  if (!labRatsBackendInstance) {
    // Try to get config from electron main process
    let config = null;
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.config) {
        config = await window.electronAPI.config.get();
        console.log('[LABRATS-BACKEND] Loaded config:', config?.backend?.labrats_llm);
      }
    } catch (error) {
      console.warn('[LABRATS-BACKEND] Could not access config, using defaults:', error);
    }

    // Create service with config values or defaults
    const endpoint = config?.backend?.labrats_llm?.endpoint || 'http://localhost:11434';
    const model = config?.backend?.labrats_llm?.model || 'mistral:latest';
    const timeout = config?.backend?.labrats_llm?.timeout || 30000;
    
    console.log('[LABRATS-BACKEND] Initializing with:', { endpoint, model, timeout });
    labRatsBackendInstance = new LabRatsBackendService(endpoint, model, timeout);
    
    // Ensure availability is checked before returning
    await labRatsBackendInstance.ensureAvailable();
    
    // Start health checks
    labRatsBackendInstance.startHealthChecks();
  }
  return labRatsBackendInstance;
}

export function getLabRatsBackend(): LabRatsBackendService {
  if (!labRatsBackendInstance) {
    // Create with defaults for synchronous access
    labRatsBackendInstance = new LabRatsBackendService();
    
    // Trigger availability check asynchronously
    labRatsBackendInstance.ensureAvailable().catch(error => {
      console.warn('[LABRATS-BACKEND] Failed to check availability:', error);
    });
    
    // Try to update with actual config asynchronously
    getLabRatsBackendAsync().catch(error => {
      console.warn('[LABRATS-BACKEND] Failed to update with config:', error);
    });
  }
  return labRatsBackendInstance;
}

// Reset the instance to force config reload
export function resetLabRatsBackend(): void {
  labRatsBackendInstance = null;
}