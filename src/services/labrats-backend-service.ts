export interface DecisionRequest {
  conversationId: string;
  agentId: string;
  agentName: string;
  agentTitle: string;
  agentPersona?: string;
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

// Import the decision prompt template
import agentDecisionPrompt from '../prompts/agent-decision.prompt';

export class LabRatsBackendService {
  private backendUrl: string;
  private model: string;
  private timeout: number;
  private isAvailable: boolean = false;
  private statusListeners: Set<(isOnline: boolean) => void> = new Set();
  private statusCheckInterval: number | null = null;
  private conversationStates: Map<string, Map<string, any>> = new Map();

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

  async initializeConversation(conversationId: string, agentId: string, persona: string): Promise<void> {
    if (!this.conversationStates.has(conversationId)) {
      this.conversationStates.set(conversationId, new Map());
    }
    
    const conversation = this.conversationStates.get(conversationId)!;
    conversation.set(agentId, {
      persona,
      decisionHistory: [],
      lastDecisionTime: null
    });
    
    console.log(`[LABRATS-BACKEND] Initialized conversation ${conversationId} for agent ${agentId}`);
  }

  async shouldAgentRespond(request: DecisionRequest): Promise<DecisionResponse> {
    console.log(`[LABRATS-BACKEND-DECISION] Making decision for ${request.agentName} in conversation ${request.conversationId}`);
    
    if (!this.isAvailable) {
      console.log(`[LABRATS-BACKEND-DECISION] Backend not available for ${request.agentName} decision`);
      return {
        success: false,
        shouldRespond: false,
        error: 'LabRats backend not available - cannot make agent decisions'
      };
    }

    // Initialize conversation if needed
    if (!this.conversationStates.has(request.conversationId)) {
      this.conversationStates.set(request.conversationId, new Map());
    }
    
    const conversation = this.conversationStates.get(request.conversationId)!;
    if (!conversation.has(request.agentId) && request.agentPersona) {
      conversation.set(request.agentId, {
        persona: request.agentPersona,
        decisionHistory: [],
        lastDecisionTime: null
      });
    }

    try {
      const decisionPrompt = this.buildDecisionPrompt(request);
      console.log(`[LABRATS-BACKEND-DECISION] Sending decision request to backend for ${request.agentName}`);
      
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
      
      // Store decision history
      const agentState = conversation.get(request.agentId);
      if (agentState) {
        agentState.decisionHistory.push({
          timestamp: Date.now(),
          message: request.message,
          decision: shouldRespond,
          reasoning: responseText
        });
        agentState.lastDecisionTime = Date.now();
        
        // Keep only last 10 decisions per agent
        if (agentState.decisionHistory.length > 10) {
          agentState.decisionHistory.shift();
        }
      }
      
      console.log(`[LABRATS-BACKEND-DECISION] Backend decision for ${request.agentName}: ${shouldRespond ? 'YES' : 'NO'} (raw: "${responseText}")`);
      
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
    // Use the agent-decision.prompt template with variable substitution
    let prompt = agentDecisionPrompt;
    
    // Replace template variables
    prompt = prompt.replace('${agentName}', request.agentName);
    prompt = prompt.replace('${agentTitle}', request.agentTitle);
    prompt = prompt.replace('${messageAuthor}', request.messageAuthor);
    prompt = prompt.replace('${message}', request.message);
    prompt = prompt.replace('${conversationContext}', request.conversationContext);
    prompt = prompt.replace('${agentRecentMessages}', request.agentRecentMessages || 'None');
    
    // If we have the agent's persona stored, include it for better context
    const conversation = this.conversationStates.get(request.conversationId);
    const agentState = conversation?.get(request.agentId);
    if (agentState?.persona) {
      prompt = `AGENT PERSONA:\n${agentState.persona}\n\n${prompt}`;
    }
    
    return prompt;
  }

  get available(): boolean {
    return this.isAvailable;
  }

  async ensureAvailable(): Promise<void> {
    await this.checkAvailability();
  }

  // Clean up old conversation states (older than 24 hours)
  cleanupOldConversations(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [conversationId, agents] of this.conversationStates.entries()) {
      let hasRecentActivity = false;
      
      for (const agentState of agents.values()) {
        if (agentState.lastDecisionTime && agentState.lastDecisionTime > oneDayAgo) {
          hasRecentActivity = true;
          break;
        }
      }
      
      if (!hasRecentActivity) {
        this.conversationStates.delete(conversationId);
        console.log(`[LABRATS-BACKEND] Cleaned up old conversation: ${conversationId}`);
      }
    }
  }

  // Get conversation state for debugging
  getConversationState(conversationId: string): Map<string, any> | undefined {
    return this.conversationStates.get(conversationId);
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
    this.statusCheckInterval = window.setInterval(async () => {
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
      window.clearInterval(this.statusCheckInterval);
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