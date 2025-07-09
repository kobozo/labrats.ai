import { BrowserEventEmitter } from './browser-event-emitter';
import { getLangChainChatService, LangChainChatMessage } from './langchain-chat-service';
import { ChatOrchestrator, OrchestratorMessage } from './chat-orchestrator';
import { getPromptManager } from './prompt-manager';
import { agents } from '../config/agents';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAIProviderManager } from './ai-provider-manager';

export interface MultiAgentChatOptions {
  initialGoal?: string;
  cooldownMs?: number;
  maxConsecutiveAgentTurns?: number;
  enableOrchestrator?: boolean;
}

export interface MultiAgentChatMessage extends LangChainChatMessage {
  author: string;
  audience: string[];
  isSystem?: boolean;
}

export class MultiAgentChatService extends BrowserEventEmitter {
  private orchestrator: ChatOrchestrator;
  private langChainService = getLangChainChatService();
  private promptManager = getPromptManager();
  private conversationHistory: MultiAgentChatMessage[] = [];
  private agentSessions: Map<string, string> = new Map(); // agentId -> unique session ID
  private agentContexts: Map<string, string[]> = new Map(); // agentId -> their specific context messages
  private isActive = false;

  constructor(options: MultiAgentChatOptions = {}) {
    super();
    
    this.orchestrator = new ChatOrchestrator({
      initialGoal: options.initialGoal,
      cooldownMs: options.cooldownMs,
      maxConsecutiveAgentTurns: options.maxConsecutiveAgentTurns
    });

    // Listen to orchestrator events
    this.orchestrator.on('system-message', (msg: OrchestratorMessage) => {
      this.handleSystemMessage(msg);
    });

    this.orchestrator.on('conversation-ended', (data: any) => {
      this.handleConversationEnded(data);
    });
  }

  async startConversation(initialMessage: string): Promise<void> {
    if (this.isActive) {
      throw new Error('Conversation is already active');
    }

    console.log(`[MULTI-AGENT] Starting conversation with message: "${initialMessage}"`);
    
    this.isActive = true;
    this.conversationHistory = [];
    this.agentSessions.clear(); // Clear all agent sessions for fresh start
    this.agentContexts.clear(); // Clear all agent contexts for fresh start
    
    // Add initial user message
    const userMessage: MultiAgentChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: initialMessage,
      timestamp: new Date(),
      author: 'user',
      audience: ['*']
    };

    this.conversationHistory.push(userMessage);
    this.emit('message', userMessage);

    console.log(`[MULTI-AGENT] Initial members: ${this.orchestrator.currentMembers.join(', ')}`);

    // Start with Product Owner (Cortex) response
    await this.invokeAgent('cortex', userMessage);
  }

  async sendMessage(content: string, author: string = 'user'): Promise<void> {
    if (!this.isActive) {
      throw new Error('No active conversation');
    }

    console.log(`[MULTI-AGENT] Sending message from ${author}: "${content.substring(0, 100)}..."`);

    const message: MultiAgentChatMessage = {
      id: this.generateId(),
      role: author === 'user' ? 'user' : 'assistant',
      content,
      timestamp: new Date(),
      author,
      audience: ['*']
    };

    // Check with orchestrator if this message should be processed
    const orchestratorMessage: OrchestratorMessage = { ...message };
    const shouldProcess = this.orchestrator.handle(orchestratorMessage);

    if (!shouldProcess) {
      // Message was filtered by orchestrator (cooldown, etc.)
      console.log(`[MULTI-AGENT] Message from ${author} filtered by orchestrator`);
      return;
    }

    this.conversationHistory.push(message);
    this.emit('message', message);

    // Add user messages to all active agents' contexts
    if (author === 'user') {
      this.addUserMessageToAgentContexts(content);
    }

    // Check if user sent orchestrator commands that need processing
    if (author === 'user' && content.includes('@orchestrator')) {
      await this.processOrchestratorCommands(content);
    }

    // If conversation is still active, trigger agent responses
    if (this.isActive && author !== 'system') {
      await this.processAgentResponses(message);
    }
  }

  private async processAgentResponses(triggerMessage: MultiAgentChatMessage): Promise<void> {
    const activeAgents = this.orchestrator.currentMembers.filter(agentId => agentId !== 'cortex');
    
    console.log(`[MULTI-AGENT] Processing agent responses for trigger from: ${triggerMessage.author}`);
    console.log(`[MULTI-AGENT] Active agents (excluding cortex): ${activeAgents.join(', ')}`);
    
    // Check each active agent to see if they should respond
    for (const agentId of activeAgents) {
      if (!this.orchestrator.isActive) break;

      console.log(`[MULTI-AGENT] Checking agent ${agentId} for response`);
      
      const cooldownStatus = this.orchestrator.getAgentCooldownStatus(agentId);
      if (!cooldownStatus.canRespond) {
        console.log(`[MULTI-AGENT] Agent ${agentId} is in cooldown (${cooldownStatus.cooldownRemaining}ms remaining)`);
        continue;
      }

      // Check if agent should respond based on context
      console.log(`[MULTI-AGENT] Checking if agent ${agentId} should respond to context`);
      const shouldRespond = await this.shouldAgentRespond(agentId, triggerMessage);
      console.log(`[MULTI-AGENT] Agent ${agentId} should respond: ${shouldRespond}`);
      
      if (shouldRespond) {
        console.log(`[MULTI-AGENT] Invoking agent ${agentId} for response`);
        await this.invokeAgent(agentId, triggerMessage);
        break; // Only one agent responds per trigger to avoid chaos
      }
    }
  }

  private async shouldAgentRespond(agentId: string, triggerMessage: MultiAgentChatMessage): Promise<boolean> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return false;

    // Create a decision prompt for the agent using their specific context
    const agentContext = this.agentContexts.get(agentId) || [];
    const recentContext = agentContext.slice(-5).join('\n') || 'No previous context';
    
    const decisionPrompt = `
Based on the conversation context and your role as ${agent.name} (${agent.title}), 
should you respond to this message?

Your recent context:
${recentContext}

Current message: "${triggerMessage.content}"

Respond with only "YES" if you should respond (you can add new, concrete value), or "NO" if you should stay silent.
`;

    try {
      const response = await this.langChainService.sendMessage(decisionPrompt, {
        agentId: agentId,
        systemPrompt: await this.promptManager.getPrompt(agentId),
        temperature: 0.1, // Low temperature for consistent decisions
        maxTokens: 10
      });

      return response.success && Boolean(response.message?.content.trim().toUpperCase().startsWith('YES'));
    } catch (error) {
      console.error(`Error checking if agent ${agentId} should respond:`, error);
      return false;
    }
  }

  private async invokeAgent(agentId: string, triggerMessage: MultiAgentChatMessage): Promise<void> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      console.error(`[MULTI-AGENT] Agent ${agentId} not found`);
      return;
    }

    console.log(`[MULTI-AGENT] Starting invocation of agent ${agentId} (${agent.name})`);

    try {
      // Get agent's system prompt
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      console.log(`[MULTI-AGENT] Got system prompt for ${agentId}, length: ${systemPrompt.length}`);
      
      // Create agent-specific context
      const context = this.buildAgentSpecificContext(agentId);
      console.log(`[MULTI-AGENT] Built agent-specific context for ${agentId}:`);
      console.log(`[MULTI-AGENT] Context: ${context.substring(0, 200)}...`);
      
      // Generate response using isolated agent session
      console.log(`[MULTI-AGENT] Calling LangChain with isolated session for agent ${agentId}`);
      const response = await this.callAgentWithIsolatedSession(agentId, context, systemPrompt);

      console.log(`[MULTI-AGENT] LangChain response for ${agentId}:`, {
        success: response.success,
        messageLength: response.message?.content?.length || 0,
        error: response.error
      });

      if (response.success && response.message) {
        const agentMessage: MultiAgentChatMessage = {
          ...response.message,
          author: agentId,
          audience: ['*']
        };

        console.log(`[MULTI-AGENT] Created agent message for ${agentId}:`, {
          id: agentMessage.id,
          author: agentMessage.author,
          contentLength: agentMessage.content.length
        });

        // Process through orchestrator
        const orchestratorMessage: OrchestratorMessage = { ...agentMessage };
        const shouldProcess = this.orchestrator.handle(orchestratorMessage);

        console.log(`[MULTI-AGENT] Orchestrator processing result for ${agentId}: ${shouldProcess}`);

        if (shouldProcess) {
          this.conversationHistory.push(agentMessage);
          
          // Add this agent's response to relevant contexts
          this.updateAgentContexts(agentId, agentMessage.content);
          
          this.emit('message', agentMessage);
          console.log(`[MULTI-AGENT] ✅ Agent ${agentId} message emitted successfully`);
          
          // Check if this agent sent orchestrator commands that need processing
          if (agentId === 'cortex') {
            await this.processOrchestratorCommands(agentMessage.content);
          }
        } else {
          console.log(`[MULTI-AGENT] ❌ Agent ${agentId} message blocked by orchestrator`);
        }
      } else {
        console.log(`[MULTI-AGENT] ❌ Agent ${agentId} failed to generate response`);
      }
    } catch (error) {
      console.error(`[MULTI-AGENT] Error invoking agent ${agentId}:`, error);
    }
  }


  private handleSystemMessage(msg: OrchestratorMessage): void {
    const systemMessage: MultiAgentChatMessage = {
      ...msg,
      isSystem: true
    };
    
    this.conversationHistory.push(systemMessage);
    this.emit('message', systemMessage);
  }

  private handleConversationEnded(data: any): void {
    this.isActive = false;
    this.emit('conversation-ended', data);
  }

  private getOrCreateAgentSession(agentId: string): string {
    if (!this.agentSessions.has(agentId)) {
      const sessionId = `agent_${agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.agentSessions.set(agentId, sessionId);
      console.log(`[MULTI-AGENT] Created new session for agent ${agentId}: ${sessionId}`);
    }
    return this.agentSessions.get(agentId)!;
  }

  private addMessageToAgentContext(agentId: string, message: string): void {
    if (!this.agentContexts.has(agentId)) {
      this.agentContexts.set(agentId, []);
    }
    
    const context = this.agentContexts.get(agentId)!;
    context.push(message);
    
    // Keep only the last 10 messages for each agent to prevent context bloat
    if (context.length > 10) {
      context.splice(0, context.length - 10);
    }
    
    console.log(`[MULTI-AGENT] Added message to ${agentId} context. Total messages: ${context.length}`);
  }

  private buildAgentSpecificContext(agentId: string): string {
    const agentContext = this.agentContexts.get(agentId) || [];
    const activeMembers = this.orchestrator.currentMembers
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean)
      .map(agent => `${agent!.name} (${agent!.title})`)
      .join(', ');

    // Build context specific to this agent
    let context = `Current team members: ${activeMembers}\n`;
    context += `Goal: ${this.orchestrator.currentGoal}\n`;
    context += `Your session ID: ${this.getOrCreateAgentSession(agentId)}\n\n`;
    
    if (agentContext.length > 0) {
      context += `Recent conversation relevant to you:\n`;
      context += agentContext.join('\n');
    } else {
      context += `This is your first interaction in this conversation.\n`;
    }
    
    context += `\n\nPlease respond based on your role and expertise. Only respond if you can add new, concrete value toward the goal.`;
    
    return context;
  }

  private updateAgentContexts(fromAgentId: string, message: string): void {
    const agent = agents.find(a => a.id === fromAgentId);
    const agentName = agent?.name || fromAgentId;
    const formattedMessage = `${agentName}: ${message}`;
    
    // Add to all active agents' contexts (they need to know what others are saying)
    for (const agentId of this.orchestrator.currentMembers) {
      // Don't add agent's own message to their context
      if (agentId !== fromAgentId) {
        this.addMessageToAgentContext(agentId, formattedMessage);
      }
    }
  }

  private addUserMessageToAgentContexts(userMessage: string): void {
    // Add user messages to all active agents' contexts
    const formattedMessage = `User: ${userMessage}`;
    for (const agentId of this.orchestrator.currentMembers) {
      this.addMessageToAgentContext(agentId, formattedMessage);
    }
  }

  private async callAgentWithIsolatedSession(agentId: string, context: string, systemPrompt: string): Promise<{ success: boolean; message?: LangChainChatMessage; error?: string }> {
    try {
      const sessionId = this.getOrCreateAgentSession(agentId);
      console.log(`[MULTI-AGENT] Using isolated session ${sessionId} for agent ${agentId}`);
      
      // Get API key and provider info
      const providerManager = getAIProviderManager();
      const defaultConfig = await providerManager.getDefault();
      
      if (!defaultConfig) {
        throw new Error('No default AI provider configuration found');
      }
      
      let apiKey = '';
      if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
        const result = await window.electronAPI.ai.getAPIKey(defaultConfig.providerId);
        if (result.success && result.apiKey) {
          apiKey = result.apiKey;
        }
      }
      
      if (!apiKey) {
        throw new Error(`No API key available for ${defaultConfig.providerId}`);
      }
      
      // Create chat model with agent-specific configuration
      let chatModel;
      if (defaultConfig.providerId === 'openai') {
        chatModel = new ChatOpenAI({
          modelName: defaultConfig.modelId,
          temperature: 0.7,
          maxTokens: 4096,
          openAIApiKey: apiKey,
          // Add agent-specific metadata
          metadata: {
            agentId: agentId,
            sessionId: sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          }
        });
      } else if (defaultConfig.providerId === 'anthropic') {
        chatModel = new ChatAnthropic({
          model: defaultConfig.modelId,
          temperature: 0.7,
          maxTokens: 4096,
          anthropicApiKey: apiKey,
          // Add agent-specific metadata
          metadata: {
            agentId: agentId,
            sessionId: sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          }
        });
      } else {
        throw new Error(`Unsupported provider: ${defaultConfig.providerId}`);
      }
      
      // Build messages for this specific agent with only their isolated context
      const messages = [];
      
      // Add system prompt with agent session info
      const enhancedSystemPrompt = `${systemPrompt}\n\nYour isolated session ID: ${sessionId}\nThis is your personal conversation context - you are NOT sharing history with other agents.`;
      messages.push(new SystemMessage(enhancedSystemPrompt));
      
      // Add only this agent's specific context (not shared conversation history)
      messages.push(new HumanMessage(context));
      
      // Get response
      const response = await chatModel.invoke(messages);
      
      const agentMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: response.content.toString(),
        timestamp: new Date(),
        agentId: agentId,
        providerId: defaultConfig.providerId,
        modelId: defaultConfig.modelId
      };
      
      console.log(`[MULTI-AGENT] Agent ${agentId} with session ${sessionId} generated response: ${response.content.toString().substring(0, 100)}...`);
      
      return {
        success: true,
        message: agentMessage
      };
      
    } catch (error) {
      console.error(`[MULTI-AGENT] Error in isolated session call for ${agentId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }


  private async processOrchestratorCommands(content: string): Promise<void> {
    // Extract @orchestrator commands from the message content
    const orchestratorRegex = /@orchestrator\s+(\w+)(?:\s+(\w+))?/g;
    let match;
    
    while ((match = orchestratorRegex.exec(content)) !== null) {
      const command = match[1];
      const arg = match[2];
      
      console.log(`[MULTI-AGENT] Processing embedded orchestrator command: ${command} ${arg || ''}`);
      
      // Create a synthetic message for the orchestrator command
      const commandMessage: MultiAgentChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: `@orchestrator ${command}${arg ? ' ' + arg : ''}`,
        timestamp: new Date(),
        author: 'cortex',
        audience: ['*']
      };
      
      // Process the command through the orchestrator
      const orchestratorMessage: OrchestratorMessage = { ...commandMessage };
      this.orchestrator.handle(orchestratorMessage);
    }
  }

  private generateId(): string {
    return `multi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public getters
  get isConversationActive(): boolean {
    return this.isActive;
  }

  get currentGoal(): string {
    return this.orchestrator.currentGoal;
  }

  get activeAgents(): string[] {
    return this.orchestrator.currentMembers;
  }

  getConversationHistory(): MultiAgentChatMessage[] {
    return [...this.conversationHistory];
  }

  // Admin methods
  async inviteAgent(agentId: string): Promise<boolean> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return false;

    const command = `@orchestrator invite ${agentId}`;
    await this.sendMessage(command, 'cortex');
    return true;
  }

  async removeAgent(agentId: string): Promise<boolean> {
    const command = `@orchestrator remove ${agentId}`;
    await this.sendMessage(command, 'cortex');
    return true;
  }

  async endConversation(): Promise<void> {
    const command = `@orchestrator end`;
    await this.sendMessage(command, 'cortex');
  }

  async getStatus(): Promise<void> {
    const command = `@orchestrator status`;
    await this.sendMessage(command, 'cortex');
  }

  // Reset conversation
  reset(newGoal?: string): void {
    this.isActive = false;
    this.conversationHistory = [];
    this.agentSessions.clear(); // Clear all agent sessions
    this.agentContexts.clear(); // Clear all agent contexts
    this.orchestrator.reset(newGoal);
    this.emit('conversation-reset');
  }

  // Set project context
  setCurrentProject(projectPath: string | null): void {
    this.langChainService.setCurrentProject(projectPath);
  }
}

// Singleton instance
let multiAgentChatServiceInstance: MultiAgentChatService | null = null;

export function getMultiAgentChatService(options?: MultiAgentChatOptions): MultiAgentChatService {
  if (!multiAgentChatServiceInstance) {
    multiAgentChatServiceInstance = new MultiAgentChatService(options);
  }
  return multiAgentChatServiceInstance;
}