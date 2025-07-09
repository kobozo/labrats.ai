import { BrowserEventEmitter } from './browser-event-emitter';
import { getLangChainChatService, LangChainChatMessage } from './langchain-chat-service';
import { getPromptManager } from './prompt-manager';
import { agents } from '../config/agents';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAIProviderManager } from './ai-provider-manager';

export interface MentionChatMessage extends LangChainChatMessage {
  author: string;
  mentions: string[]; // Array of agent IDs mentioned in this message
  isSystem?: boolean;
}

export interface MentionChatOptions {
  maxContextMessages?: number;
}

export class MentionChatService extends BrowserEventEmitter {
  private langChainService = getLangChainChatService();
  private promptManager = getPromptManager();
  private conversationHistory: MentionChatMessage[] = [];
  private activeAgents: Set<string> = new Set(['cortex']); // Always start with Cortex
  private agentSessions: Map<string, string> = new Map();
  private readonly maxContextMessages: number;
  private isActive = false;

  constructor(options: MentionChatOptions = {}) {
    super();
    this.maxContextMessages = options.maxContextMessages || 10;
  }

  async startConversation(initialMessage: string): Promise<void> {
    if (this.isActive) {
      throw new Error('Conversation is already active');
    }

    console.log(`[MENTION-CHAT] Starting conversation with message: "${initialMessage}"`);
    
    this.isActive = true;
    this.conversationHistory = [];
    this.activeAgents.clear();
    this.activeAgents.add('cortex'); // Always start with Cortex
    this.agentSessions.clear();

    // Process the initial message
    await this.sendMessage(initialMessage);
  }

  async sendMessage(content: string, author: string = 'user'): Promise<void> {
    if (!this.isActive) {
      throw new Error('No active conversation');
    }

    console.log(`[MENTION-CHAT] Sending message from ${author}: "${content.substring(0, 100)}..."`);

    // Extract mentions from the message
    const mentions = this.extractMentions(content);
    
    // Auto-invite mentioned agents
    for (const agentId of mentions) {
      if (agents.find(a => a.id === agentId)) {
        this.activeAgents.add(agentId);
        console.log(`[MENTION-CHAT] Auto-invited agent ${agentId} due to mention`);
      }
    }

    const message: MentionChatMessage = {
      id: this.generateId(),
      role: author === 'user' ? 'user' : 'assistant',
      content,
      timestamp: new Date(),
      author,
      mentions
    };

    this.conversationHistory.push(message);
    this.emit('message', message);

    // If user message, trigger agent responses
    if (author === 'user') {
      await this.processAgentResponses(message);
    }
  }

  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      const agentId = match[1];
      if (agents.find(a => a.id === agentId)) {
        mentions.push(agentId);
      }
    }
    
    return mentions;
  }

  private async processAgentResponses(triggerMessage: MentionChatMessage): Promise<void> {
    console.log(`[MENTION-CHAT] Processing agent responses for trigger from: ${triggerMessage.author}`);
    console.log(`[MENTION-CHAT] Active agents: ${Array.from(this.activeAgents).join(', ')}`);
    console.log(`[MENTION-CHAT] Mentions in message: ${triggerMessage.mentions.join(', ')}`);
    
    // First, let mentioned agents respond (they have priority)
    for (const agentId of triggerMessage.mentions) {
      if (this.activeAgents.has(agentId)) {
        console.log(`[MENTION-CHAT] Agent ${agentId} was mentioned, will respond`);
        await this.invokeAgent(agentId, triggerMessage);
      }
    }

    // Then, check if other active agents should respond naturally
    const activeAgentsArray = Array.from(this.activeAgents);
    const nonMentionedAgents = activeAgentsArray.filter(id => 
      !triggerMessage.mentions.includes(id) && id !== triggerMessage.author
    );
    
    // Randomize order to make conversation feel more natural
    const shuffledAgents = [...nonMentionedAgents].sort(() => Math.random() - 0.5);
    
    // Let agents respond naturally based on relevance
    for (const agentId of shuffledAgents) {
      const shouldRespond = await this.shouldAgentRespondNaturally(agentId, triggerMessage);
      if (shouldRespond) {
        console.log(`[MENTION-CHAT] Agent ${agentId} will respond naturally`);
        // Add small delay to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        await this.invokeAgent(agentId, triggerMessage);
        break; // Only let one agent respond naturally per message to avoid chaos
      }
    }
  }

  private async shouldAgentRespondNaturally(agentId: string, triggerMessage: MentionChatMessage): Promise<boolean> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return false;

    // Don't respond to system messages
    if (triggerMessage.isSystem) return false;

    // Check if agent has responded recently (avoid over-participation)
    const recentMessages = this.conversationHistory.slice(-3);
    const agentRecentResponses = recentMessages.filter(msg => msg.author === agentId);
    if (agentRecentResponses.length >= 2) {
      console.log(`[MENTION-CHAT] Agent ${agentId} has responded recently, skipping natural response`);
      return false;
    }

    // Special case: Cortex should be more responsive as the main coordinator
    if (agentId === 'cortex') {
      // Cortex responds to greetings, questions about the team, and general inquiries
      const messageContent = triggerMessage.content.toLowerCase();
      const shouldCortexRespond = messageContent.includes('hello') || 
                                 messageContent.includes('hi') || 
                                 messageContent.includes('who') || 
                                 messageContent.includes('here') || 
                                 messageContent.includes('can you') || 
                                 messageContent.includes('cortex') ||
                                 messageContent.includes('team') ||
                                 messageContent.includes('help') ||
                                 this.conversationHistory.length <= 2; // First few messages
      
      if (shouldCortexRespond) {
        console.log(`[MENTION-CHAT] Cortex responding to coordination/greeting message`);
        return true;
      }
    }

    // Get conversation context
    const contextMessages = this.conversationHistory.slice(-5);
    const lastFewMessages = contextMessages.map(msg => {
      const authorName = msg.author === 'user' ? 'User' : 
                        agents.find(a => a.id === msg.author)?.name || msg.author;
      return `${authorName}: ${msg.content}`;
    }).join('\n');

    // Create a more encouraging decision prompt
    const decisionPrompt = `
You are ${agent.name} (${agent.title}) in a team conversation. The user is asking:
"${triggerMessage.content}"

Recent conversation:
${lastFewMessages}

Should you respond naturally? Consider:
- Can you provide helpful information about your specialty (${agent.title})?
- Is the user asking something you can answer?
- Would a brief, friendly response be appropriate?
- Are they asking general questions that warrant a team response?

You should respond if:
- They're asking "who can hear me" or similar (introduce yourself)
- They mention something related to your expertise
- It's a general question the team should address
- You can provide useful context or help

Respond with only "YES" if you should join the conversation, or "NO" if you should stay quiet.
When in doubt, lean toward being helpful and responsive.
`;

    try {
      const response = await this.callAgentWithDecision(agentId, decisionPrompt);
      const shouldRespond = response.success && 
                           response.content?.trim().toUpperCase().startsWith('YES') === true;
      
      console.log(`[MENTION-CHAT] Agent ${agentId} natural response decision: ${shouldRespond} (response: "${response.content?.trim()}")`);
      return shouldRespond;
    } catch (error) {
      console.error(`[MENTION-CHAT] Error checking if agent ${agentId} should respond naturally:`, error);
      return false;
    }
  }

  private async callAgentWithDecision(agentId: string, prompt: string): Promise<{ success: boolean; content?: string }> {
    try {
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
      
      // Create chat model
      let chatModel;
      if (defaultConfig.providerId === 'openai') {
        chatModel = new ChatOpenAI({
          modelName: defaultConfig.modelId,
          temperature: 0.1, // Low temperature for consistent decisions
          maxTokens: 50, // Increased for complete responses
          openAIApiKey: apiKey
        });
      } else if (defaultConfig.providerId === 'anthropic') {
        chatModel = new ChatAnthropic({
          model: defaultConfig.modelId,
          temperature: 0.1,
          maxTokens: 50,
          anthropicApiKey: apiKey
        });
      } else {
        throw new Error(`Unsupported provider: ${defaultConfig.providerId}`);
      }
      
      // Get agent's system prompt for context
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      
      // Build messages
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(prompt)
      ];
      
      // Get response
      const response = await chatModel.invoke(messages);
      
      return {
        success: true,
        content: response.content.toString()
      };
      
    } catch (error) {
      console.error(`[MENTION-CHAT] Error in decision call for ${agentId}:`, error);
      return {
        success: false
      };
    }
  }

  private async invokeAgent(agentId: string, triggerMessage: MentionChatMessage): Promise<void> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      console.error(`[MENTION-CHAT] Agent ${agentId} not found`);
      return;
    }

    console.log(`[MENTION-CHAT] Invoking agent ${agentId} (${agent.name})`);

    try {
      // Get agent's system prompt
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      
      // Create agent-specific context
      const context = this.buildAgentContext(agentId, triggerMessage);
      
      // Generate response using isolated agent session
      const response = await this.callAgentWithIsolatedSession(agentId, context, systemPrompt);

      if (response.success && response.message) {
        const agentMessage: MentionChatMessage = {
          ...response.message,
          author: agentId,
          mentions: this.extractMentions(response.message.content)
        };

        // Add new mentions to active agents
        for (const mentionedId of agentMessage.mentions) {
          if (agents.find(a => a.id === mentionedId)) {
            this.activeAgents.add(mentionedId);
            console.log(`[MENTION-CHAT] Agent ${mentionedId} auto-invited by ${agentId}`);
          }
        }

        this.conversationHistory.push(agentMessage);
        this.emit('message', agentMessage);
        
        console.log(`[MENTION-CHAT] ✅ Agent ${agentId} responded successfully`);
      } else {
        console.log(`[MENTION-CHAT] ❌ Agent ${agentId} failed to generate response`);
      }
    } catch (error) {
      console.error(`[MENTION-CHAT] Error invoking agent ${agentId}:`, error);
    }
  }

  private buildAgentContext(agentId: string, triggerMessage?: MentionChatMessage): string {
    const activeAgentList = Array.from(this.activeAgents)
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean)
      .map(agent => `${agent!.name} (${agent!.title})`)
      .join(', ');

    // Get last N messages for context
    const recentMessages = this.conversationHistory.slice(-this.maxContextMessages);
    
    let context = `Active team members: ${activeAgentList}\n`;
    context += `Your session ID: ${this.getOrCreateAgentSession(agentId)}\n\n`;
    
    if (triggerMessage && triggerMessage.mentions.includes(agentId)) {
      context += `🔥 You were mentioned in this message: "${triggerMessage.content}"\n\n`;
    } else if (triggerMessage) {
      context += `💬 You're responding naturally to the conversation flow.\n\n`;
    }
    
    context += `Recent conversation (last ${this.maxContextMessages} messages):\n`;
    
    for (const msg of recentMessages) {
      const authorName = msg.author === 'user' ? 'User' : 
                        agents.find(a => a.id === msg.author)?.name || msg.author;
      context += `${authorName}: ${msg.content}\n`;
    }
    
    context += `\nGuidelines:
- You're part of an active team conversation
- Respond naturally when you can add value
- You can mention other agents using @agentId to invite them
- Stay focused on your expertise but collaborate with others
- Keep responses concise and actionable`;
    
    return context;
  }

  private getOrCreateAgentSession(agentId: string): string {
    if (!this.agentSessions.has(agentId)) {
      const sessionId = `agent_${agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.agentSessions.set(agentId, sessionId);
      console.log(`[MENTION-CHAT] Created session for agent ${agentId}: ${sessionId}`);
    }
    return this.agentSessions.get(agentId)!;
  }

  private async callAgentWithIsolatedSession(agentId: string, context: string, systemPrompt: string): Promise<{ success: boolean; message?: LangChainChatMessage; error?: string }> {
    try {
      const sessionId = this.getOrCreateAgentSession(agentId);
      
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
      
      // Create chat model
      let chatModel;
      if (defaultConfig.providerId === 'openai') {
        chatModel = new ChatOpenAI({
          modelName: defaultConfig.modelId,
          temperature: 0.7,
          maxTokens: 4096,
          openAIApiKey: apiKey,
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
          metadata: {
            agentId: agentId,
            sessionId: sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          }
        });
      } else {
        throw new Error(`Unsupported provider: ${defaultConfig.providerId}`);
      }
      
      // Build messages
      const messages = [];
      
      // Add system prompt
      const enhancedSystemPrompt = `${systemPrompt}\n\nYour session ID: ${sessionId}\nYou can mention other agents using @agentId to invite them to respond.`;
      messages.push(new SystemMessage(enhancedSystemPrompt));
      
      // Add context
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
      
      console.log(`[MENTION-CHAT] Agent ${agentId} with session ${sessionId} generated response`);
      
      return {
        success: true,
        message: agentMessage
      };
      
    } catch (error) {
      console.error(`[MENTION-CHAT] Error in isolated session call for ${agentId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private generateId(): string {
    return `mention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public getters
  get isConversationActive(): boolean {
    return this.isActive;
  }

  get currentActiveAgents(): string[] {
    return Array.from(this.activeAgents);
  }

  getConversationHistory(): MentionChatMessage[] {
    return [...this.conversationHistory];
  }

  getAvailableAgents(): string[] {
    return agents.map(a => a.id);
  }

  // Set project context
  setCurrentProject(projectPath: string | null): void {
    this.langChainService.setCurrentProject(projectPath);
  }

  // Reset conversation
  reset(): void {
    this.isActive = false;
    this.conversationHistory = [];
    this.activeAgents.clear();
    this.activeAgents.add('cortex');
    this.agentSessions.clear();
    this.emit('conversation-reset');
  }
}

// Singleton instance
let mentionChatServiceInstance: MentionChatService | null = null;

export function getMentionChatService(options?: MentionChatOptions): MentionChatService {
  if (!mentionChatServiceInstance) {
    mentionChatServiceInstance = new MentionChatService(options);
  }
  return mentionChatServiceInstance;
}