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

  constructor(backendUrl?: string, model?: string, timeout?: number) {
    // Default values or from config
    this.backendUrl = backendUrl || 'http://localhost:11434';
    this.model = model || 'mistral';
    this.timeout = timeout || 30000;
    this.checkAvailability();
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
    if (!this.isAvailable) {
      return {
        success: false,
        shouldRespond: false, // No fallback - backend must be available
        error: 'LabRats backend not available - cannot make agent decisions'
      };
    }

    try {
      const decisionPrompt = this.buildDecisionPrompt(request);
      
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
    return `You are helping to decide if an AI agent should respond to a team message.

Agent Details:
- Name: ${request.agentName}
- Role: ${request.agentTitle}
- ID: ${request.agentId}

Recent conversation context:
${request.conversationContext}

Agent's recent messages:
${request.agentRecentMessages || 'None'}

Latest message: "${request.message}"
Message author: ${request.messageAuthor}

Should ${request.agentName} (${request.agentTitle}) respond to this message?

Consider:
- Does this relate to their expertise?
- Can they deliver working code to solve the problem?
- Is this a direct question or mention?
- Would their response provide concrete implementation?
- Prioritize agents who can deliver code over those who just discuss

Respond with only "YES" or "NO".`;
  }

  get available(): boolean {
    return this.isAvailable;
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
  }
  return labRatsBackendInstance;
}

export function getLabRatsBackend(): LabRatsBackendService {
  if (!labRatsBackendInstance) {
    // Create with defaults for synchronous access
    labRatsBackendInstance = new LabRatsBackendService();
    
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