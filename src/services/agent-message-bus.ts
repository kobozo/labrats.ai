import { BrowserEventEmitter } from './browser-event-emitter';
import { getLangChainChatService, LangChainChatMessage, TokenUsage } from './langchain-chat-service';
import { getPromptManager } from './prompt-manager';
import { agents } from '../config/agents';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMResult } from '@langchain/core/outputs';
import { getAIProviderManager } from './ai-provider-manager';
import { getLabRatsBackend, getLabRatsBackendAsync, resetLabRatsBackend } from './labrats-backend-service';
import { notificationService } from './notification-service';
import { z } from 'zod';

// Zod schema for agent response structure
const agentResponseSchema = z.object({
  message: z.string().describe("Your actual response text here - include code blocks, explanations, everything you want to say"),
  action: z.enum(['done', 'open', 'waiting', 'needs_review', 'implementing', 'planning', 'reviewing', 'user_input', 'wait_for_user']).describe("Current action state"),
  involve: z.array(z.string()).describe("Agent IDs to involve NOW (not for future steps) - use 'labrats' for user mention"),
  metadata: z.object({
    type: z.enum(['implementation', 'review', 'planning', 'documentation', 'deployment', 'testing']).optional().describe("Type of work being done"),
    waitingFor: z.array(z.string()).optional().describe("Agent IDs you are waiting for")
  }).describe("Additional metadata")
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export interface BusMessage {
  id: string;
  content: string;
  author: string; // 'user' or agent ID
  timestamp: Date;
  mentions: string[]; // Array of agent IDs mentioned
  messageType: 'user' | 'agent' | 'system';
  sessionId?: string; // For agent messages
  action?: AgentAction; // Agent's current state
  involve?: string[]; // Agents to involve next
  metadata?: AgentMetadata; // Additional context
}

export type AgentAction = 'done' | 'open' | 'waiting' | 'needs_review' | 'implementing' | 'planning' | 'reviewing' | 'user_input' | 'wait_for_user';

export interface AgentMetadata {
  confidence?: number;
  priority?: 'high' | 'medium' | 'low';
  type?: 'implementation' | 'review' | 'planning' | 'documentation' | 'deployment' | 'testing';
  waitingFor?: string[]; // Which agents they're waiting for
}

export interface AgentContext {
  agentId: string;
  sessionId: string;
  isActive: boolean;
  personalMessageHistory: BusMessage[]; // Only messages relevant to this agent
  lastResponseTime: Date | null;
  currentAction: AgentAction; // Track agent's current state
  metadata?: AgentMetadata; // Additional context and waiting dependencies
  promptInitialized?: boolean; // Track if agent has received full prompt
  tokenUsage?: TokenUsage; // Track token usage for this agent
  lastSystemPrompt?: string; // Last system prompt sent to agent
  lastContext?: string; // Last context sent to agent
  lastRawResponse?: string; // Last raw response from agent (including internal thoughts)
}

export interface MessageBusOptions {
  maxContextMessages?: number;
  maxAgentHistory?: number;
}

export class AgentMessageBus extends BrowserEventEmitter {
  private globalMessageHistory: BusMessage[] = [];
  private agentContexts: Map<string, AgentContext> = new Map();
  private promptManager = getPromptManager();
  private readonly maxContextMessages: number;
  private readonly maxAgentHistory: number;
  private busActive = false;
  private agentsActive = true; // New: Controls whether agents can respond
  private lastActivityTime: Date = new Date();
  private stallDetectionTimer: NodeJS.Timeout | null = null;
  private readonly stallTimeoutMs = 10000; // 10 seconds
  private sessionTokenUsage: TokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
  private responseQueue: Array<{agentId: string, triggerMessage: BusMessage, contextSnapshot: BusMessage[]}> = []; // Queue with context snapshots
  private queueProcessing = false; // Flag to prevent concurrent queue processing
  private conversationGoals: string[] = []; // Track defined goals for this conversation
  private goalsEstablished = false; // Whether Cortex has defined the goals yet
  private loopDetection: Map<string, { lastContent: string; count: number; lastTimestamp: number }> = new Map();
  private failedAgents: Set<string> = new Set(); // Track agents that have failed
  private conversationId: string = ''; // Unique ID for this conversation
  private mcpReady: boolean = false; // Track MCP readiness

  constructor(options: MessageBusOptions = {}) {
    super();
    this.maxContextMessages = options.maxContextMessages || 10;
    this.maxAgentHistory = options.maxAgentHistory || 20;
  }

  async startBus(initialMessage: string): Promise<void> {
    if (this.busActive) {
      throw new Error('Message bus is already active');
    }

    console.log(`[AGENT-BUS] Starting message bus with: "${initialMessage}"`);
    
    // Generate unique conversation ID
    this.conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[AGENT-BUS] New conversation ID: ${this.conversationId}`);
    
    // Reset and initialize LabRats backend with latest configuration
    resetLabRatsBackend();
    try {
      const backend = await getLabRatsBackendAsync();
      console.log(`[AGENT-BUS] LabRats backend initialized: ${backend.available}`);
      
      if (!backend.available) {
        throw new Error('LabRats backend is not available. Please check your backend configuration in Settings and ensure the backend service is running.');
      }
      
      // Clean up old conversations periodically
      backend.cleanupOldConversations();
    } catch (error) {
      console.error('[AGENT-BUS] LabRats backend not available:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Cannot start multi-agent chat: ${errorMessage}\n\nPlease go to Settings > Backend and configure your LabRats backend correctly.`);
    }

    // Check MCP status
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.mcp) {
        const status = await window.electronAPI.mcp.getStatus();
        this.mcpReady = status.ready;
        console.log('[AGENT-BUS] MCP status:', status);
      }
    } catch (error) {
      console.error('[AGENT-BUS] Failed to check MCP status:', error);
      this.mcpReady = false;
    }
    
    this.busActive = true;
    this.globalMessageHistory = [];
    this.agentContexts.clear();
    this.responseQueue = []; // Clear any stale queue entries
    this.queueProcessing = false;
    this.conversationGoals = []; // Clear goals for new conversation
    this.goalsEstablished = false; // Reset goals flag
    
    // Initialize Cortex as the primary coordinator
    await this.createAgentContext('cortex');
    
    // NOTE: Ziggy and Scratchy will be created only when they decide to join
    // through the AI decision process, not automatically
    
    // Add initial user message to bus
    const userMessage: BusMessage = {
      id: this.generateId(),
      content: initialMessage,
      author: 'user',
      timestamp: new Date(),
      mentions: this.extractMentions(initialMessage),
      messageType: 'user'
    };

    await this.publishMessage(userMessage);
  }

  async publishMessage(message: BusMessage): Promise<void> {
    if (!this.busActive) {
      throw new Error('Message bus is not active');
    }
    
    // Check for loop detection on agent messages
    if (message.messageType === 'agent' && message.author !== 'user') {
      const isLoop = this.detectLoop(message.author, message.content);
      if (isLoop) {
        console.log(`[AGENT-BUS] Loop detected for ${message.author} - modifying response`);
        // Modify Cortex's response if it's in a loop
        if (message.author === 'cortex') {
          // Determine which agents to involve based on the conversation context
          const userRequest = this.globalMessageHistory.find(msg => msg.author === 'user')?.content.toLowerCase() || '';
          let agentsToInvolve: string[] = [];
          let taskDescription = '';
          
          // Analyze the user's request to determine appropriate agents
          if (userRequest.includes('game') || userRequest.includes('snake')) {
            agentsToInvolve = ['patchy', 'shiny'];
            taskDescription = 'start implementing the game';
          } else if (userRequest.includes('api') || userRequest.includes('backend')) {
            agentsToInvolve = ['patchy'];
            taskDescription = 'implement the backend functionality';
          } else if (userRequest.includes('ui') || userRequest.includes('frontend') || userRequest.includes('design')) {
            agentsToInvolve = ['shiny', 'sketchy'];
            taskDescription = 'work on the UI implementation';
          } else if (userRequest.includes('test')) {
            agentsToInvolve = ['sniffy'];
            taskDescription = 'set up the testing framework';
          } else if (userRequest.includes('deploy') || userRequest.includes('docker')) {
            agentsToInvolve = ['wheelie'];
            taskDescription = 'handle the deployment setup';
          } else {
            // Default to dev agents for general implementation
            agentsToInvolve = ['patchy', 'shiny'];
            taskDescription = 'start the implementation';
          }
          
          // Build the mention string
          const mentions = agentsToInvolve.map(id => `@${id}`).join(' and ');
          
          message.content = `I notice I'm repeating myself. Let me refocus on concrete next steps.\n\nBased on our discussion, ${mentions} - can you ${taskDescription}? Please share your implementation approach and any initial code.`;
          message.action = 'open';
          message.involve = agentsToInvolve;
        } else {
          // For other agents, skip publishing if looping
          console.log(`[AGENT-BUS] Skipping message from ${message.author} due to loop detection`);
          return;
        }
      }
    }

    console.log(`[AGENT-BUS] Publishing message from ${message.author}: "${message.content.substring(0, 50)}..."`);
    
    // Update activity time and reset stall detection
    this.lastActivityTime = new Date();
    this.resetStallDetection();
    
    // Add to global history
    this.globalMessageHistory.push(message);
    
    // Trim global history if needed
    if (this.globalMessageHistory.length > this.maxContextMessages * 2) {
      this.globalMessageHistory = this.globalMessageHistory.slice(-this.maxContextMessages);
    }

    // Add to relevant agent contexts
    this.distributeMessageToAgents(message);
    
    // Emit to UI
    this.emit('message', message);
    
    // Check for multiple agents reporting "done" - critical ending condition
    if (message.messageType === 'agent' && message.action === 'done') {
      const doneAgents = this.globalMessageHistory
        .filter(msg => msg.messageType === 'agent' && msg.action === 'done')
        .map(msg => msg.author);
      
      const uniqueDoneAgents = [...new Set(doneAgents)];
      
      // If Cortex is reporting done, check if we should end the conversation
      if (message.author === 'cortex' && uniqueDoneAgents.length >= 2) {
        console.log(`[AGENT-BUS] Cortex reported done and multiple agents are done - ending conversation`);
        
        // Stop the message bus to end the conversation
        this.busActive = false;
        this.agentsActive = false;
        this.resetStallDetection();
        
        // Emit conversation ended event
        this.emit('conversation-ended');
        
        return; // Don't process normal reactions
      }
      
      // If other agents are done but Cortex hasn't ended yet, trigger completion
      if (uniqueDoneAgents.length >= 2 && !uniqueDoneAgents.includes('cortex')) {
        console.log(`[AGENT-BUS] Multiple agents reported done (${uniqueDoneAgents.join(', ')}) - triggering completion`);
        
        // Create internal completion signal (no system message in chat)
        const completionSignal: BusMessage = {
          id: this.generateId(),
          content: 'CRITICAL: Goal completion detected',
          author: 'system',
          timestamp: new Date(),
          mentions: ['cortex'],
          messageType: 'system'
        };
        
        // Force invoke Cortex to summarize and end (no system message in chat)
        const cortexContext = this.agentContexts.get('cortex');
        if (cortexContext && cortexContext.isActive) {
          this.emit('agent-typing', { agentId: 'cortex', isTyping: true });
          await this.invokeAgent('cortex', completionSignal, 'mentioned');
          this.emit('agent-typing', { agentId: 'cortex', isTyping: false });
        }
        
        return; // Don't process normal reactions
      }
    }

    // If this is a user message or agent mention, process reactions
    if (message.messageType === 'user' || message.mentions.length > 0) {
      await this.processAgentReactions(message);
    }
    
    // Start stall detection after processing
    this.startStallDetection();
  }

  private distributeMessageToAgents(message: BusMessage): void {
    for (const [agentId, context] of this.agentContexts.entries()) {
      if (!context.isActive) continue;
      
      // Skip agents that are in the response queue - they stop listening until their turn
      if (this.isAgentInQueue(agentId)) {
        console.log(`[AGENT-BUS] Agent ${agentId} is in response queue, skipping message distribution to reduce backend load`);
        continue;
      }
      
      // Add message to agent's personal history if:
      // 1. It's from the user
      // 2. It mentions this agent
      // 3. It's a response to this agent's message
      // 4. It's from another agent and this agent should see it
      const shouldReceiveMessage = 
        message.messageType === 'user' ||
        message.mentions.includes(agentId) ||
        this.shouldAgentSeeMessage(agentId, message);

      if (shouldReceiveMessage) {
        context.personalMessageHistory.push(message);
        
        // Trim agent's personal history
        if (context.personalMessageHistory.length > this.maxAgentHistory) {
          context.personalMessageHistory = context.personalMessageHistory.slice(-this.maxAgentHistory);
        }
        
        console.log(`[AGENT-BUS] Agent ${agentId} received message from ${message.author}`);
      }
    }
  }

  private shouldAgentSeeMessage(agentId: string, message: BusMessage): boolean {
    // Agent should see messages from other agents if:
    // 1. The message is relevant to ongoing conversation
    // 2. It's a response to something they said
    // 3. It's part of a collaborative discussion
    
    // For now, let agents see messages from other agents if they're active
    // This enables agent-to-agent communication
    return message.messageType === 'agent' && message.author !== agentId;
  }

  private async processAgentReactions(triggerMessage: BusMessage): Promise<void> {
    console.log(`[AGENT-BUS] Processing agent reactions to message from ${triggerMessage.author} (ID: ${triggerMessage.id})`);
    
    // Skip processing if agents are paused
    if (!this.agentsActive) {
      console.log(`[AGENT-BUS] Agents are paused, skipping all reactions`);
      return;
    }
    
    // Skip processing if message is from an agent and no mentions (prevents infinite loops)
    if (triggerMessage.messageType === 'agent' && triggerMessage.mentions.length === 0) {
      console.log(`[AGENT-BUS] Skipping agent message with no mentions to prevent loops`);
      return;
    }
    
    // First, activate any mentioned agents
    for (const mentionedId of triggerMessage.mentions) {
      if (agents.find(a => a.id === mentionedId)) {
        await this.createAgentContext(mentionedId);
        console.log(`[AGENT-BUS] Activated agent ${mentionedId} due to mention`);
      }
    }

    // Add mentioned agents to queue first (but not if they're the author)
    const validMentions = triggerMessage.mentions.filter(mentionedId => mentionedId !== triggerMessage.author);
    for (const mentionedId of validMentions) {
      const context = this.agentContexts.get(mentionedId);
      if (context && context.isActive) {
        console.log(`[AGENT-BUS] Adding mentioned agent ${mentionedId} to queue - mentions always require response`);
        this.addToResponseQueue(mentionedId, triggerMessage);
      }
    }

    // Allow natural responses to user messages and agent messages that invite collaboration
    if (triggerMessage.messageType === 'user' || 
        (triggerMessage.messageType === 'agent' && (
          triggerMessage.mentions.length > 0 || 
          this.shouldTriggerAgentToAgentConversation(triggerMessage)
        ))) {
      
      // Get agents that could respond naturally (include observer agents even if not active yet)
      let potentialAgents = Array.from(this.agentContexts.entries())
        .filter(([_, context]) => context.isActive)
        .map(([agentId, _]) => agentId);
      
      // Check if this is the first user message
      const userMessages = this.globalMessageHistory.filter(msg => msg.author === 'user');
      const isFirstUserMessage = userMessages.length === 1 && triggerMessage.author === 'user';
      
      // Only include Ziggy and Scratchy if it's not the first user message
      if (!isFirstUserMessage) {
        if (!potentialAgents.includes('ziggy')) {
          potentialAgents.push('ziggy');
        }
        if (!potentialAgents.includes('scratchy')) {
          potentialAgents.push('scratchy');
        }
      }
      
      const activeAgents = potentialAgents.filter(agentId => 
        !triggerMessage.mentions.includes(agentId) && 
        agentId !== triggerMessage.author
      );

      console.log(`[AGENT-BUS] Checking natural responses from: ${activeAgents.join(', ')}`);

      // Prioritize Cortex for coordination requests, then randomize others
      let orderedAgents = [...activeAgents];
      
      // If this is a coordination request, put Cortex first
      if (triggerMessage.messageType === 'user') {
        const messageContent = triggerMessage.content.toLowerCase();
        const isCoordinationRequest = messageContent.includes('frontend') || 
                                     messageContent.includes('backend') ||
                                     messageContent.includes('design') ||
                                     messageContent.includes('invite') ||
                                     messageContent.includes('need') ||
                                     messageContent.includes('who') ||
                                     messageContent.includes('help');
        
        if (isCoordinationRequest && orderedAgents.includes('cortex')) {
          orderedAgents = ['cortex', ...orderedAgents.filter(id => id !== 'cortex')];
          console.log(`[AGENT-BUS] Prioritizing Cortex for coordination request`);
        } else {
          orderedAgents = [...orderedAgents].sort(() => Math.random() - 0.5);
        }
      } else {
        orderedAgents = [...orderedAgents].sort(() => Math.random() - 0.5);
      }
      
      // Stage 1: Check which agents want to respond and add them to queue
      if (orderedAgents.length > 0) {
        let agentsWantingToRespond = 0;
        const maxNaturalResponses = triggerMessage.messageType === 'user' ? 3 : 2; // Allow 3 responses to user messages, 2 to agent messages for better collaboration
        
        for (const agentId of orderedAgents) {
          if (agentsWantingToRespond >= maxNaturalResponses) break;
          
          console.log(`[AGENT-BUS] Checking if agent ${agentId} should respond naturally...`);
          const shouldRespond = await this.shouldAgentRespond(agentId, triggerMessage);
          if (shouldRespond) {
            console.log(`[AGENT-BUS] Agent ${agentId} wants to respond - adding to queue`);
            this.addToResponseQueue(agentId, triggerMessage);
            agentsWantingToRespond++;
          } else {
            console.log(`[AGENT-BUS] Agent ${agentId} decided not to respond naturally`);
          }
        }
        
        console.log(`[AGENT-BUS] Decision phase completed: ${agentsWantingToRespond} agents want to respond`);
      }
      
      // Stage 2: Process the response queue sequentially with fresh context
      await this.processResponseQueue();
    }
  }

  private async shouldAgentRespond(agentId: string, triggerMessage: BusMessage): Promise<boolean> {
    let context = this.agentContexts.get(agentId);
    
    // CRITICAL: Never respond to your own message
    if (triggerMessage.author === agentId) {
      console.log(`[AGENT-BUS] Agent ${agentId} cannot respond to their own message`);
      return false;
    }
    
    // CRITICAL: In one-on-one chat (only one active agent), always respond to user
    const activeAgentCount = this.getActiveAgentCount();
    if (activeAgentCount === 1 && triggerMessage.author === 'user') {
      console.log(`[AGENT-BUS] One-on-one chat with ${agentId} - skipping decision check`);
      return true;
    }
    
    // CRITICAL: Only Cortex (or mentioned agents) can respond to the first user message
    const userMessages = this.globalMessageHistory.filter(msg => msg.author === 'user');
    if (userMessages.length === 1 && triggerMessage.author === 'user' && agentId !== 'cortex') {
      console.log(`[AGENT-BUS] Agent ${agentId} cannot respond to first user message - only Cortex or mentioned agents`);
      return false;
    }
    
    // CRITICAL: Don't respond immediately after your own message (let others react first)
    const lastMessage = this.globalMessageHistory[this.globalMessageHistory.length - 1];
    const secondLastMessage = this.globalMessageHistory[this.globalMessageHistory.length - 2];
    
    if (lastMessage && lastMessage.author === agentId && triggerMessage.id === lastMessage.id) {
      console.log(`[AGENT-BUS] Agent ${agentId} just responded, must wait for others to react`);
      return false;
    }
    
    if (secondLastMessage && secondLastMessage.author === agentId && lastMessage && lastMessage.author === agentId) {
      console.log(`[AGENT-BUS] Agent ${agentId} has two consecutive messages, must wait for others`);
      return false;
    }
    
    // Special handling for observer agents (Ziggy, Scratchy) - create context if they decide to join
    if (!context && (agentId === 'ziggy' || agentId === 'scratchy')) {
      console.log(`[AGENT-BUS] Observer agent ${agentId} evaluating whether to join conversation`);
      
      // Use AI decision first, then create context if they want to join
      const aiDecision = await this.aiDecisionToRespond(agentId, triggerMessage);
      if (aiDecision) {
        console.log(`[AGENT-BUS] Observer agent ${agentId} decided to join - creating context`);
        await this.createAgentContext(agentId);
        context = this.agentContexts.get(agentId)!;
      } else {
        console.log(`[AGENT-BUS] Observer agent ${agentId} decided not to join`);
        return false;
      }
    } else if (!context) {
      console.log(`[AGENT-BUS] Agent ${agentId} has no context`);
      return false;
    }

    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      console.log(`[AGENT-BUS] Agent ${agentId} not found in agents list`);
      return false;
    }

    // Check action state-based response rules
    const senderContext = triggerMessage.author !== 'user' ? this.agentContexts.get(triggerMessage.author) : null;
    
    // Special rules for code reviewers like Clawsy
    if (agentId === 'clawsy' && context.currentAction === 'done') {
      // Clawsy should only respond again if there's NEW code to review
      const hasNewCode = triggerMessage.messageType === 'agent' && 
                        triggerMessage.content.includes('```') &&
                        triggerMessage.timestamp > (context.lastResponseTime || new Date(0));
      
      if (!hasNewCode) {
        console.log(`[AGENT-BUS] ${agentId} already completed review, no new code to review`);
        return false;
      }
    }
    
    // Check if user is asking for help - override done/waiting states
    const userNeedsHelp = triggerMessage.messageType === 'user' && (
      triggerMessage.content.toLowerCase().includes('help') ||
      triggerMessage.content.toLowerCase().includes('someone') ||
      triggerMessage.content.toLowerCase().includes('stopped answering') ||
      triggerMessage.content.toLowerCase().includes('everybody stopped') ||
      triggerMessage.content.toLowerCase().includes('can we get') ||
      triggerMessage.content.toLowerCase().includes('nothing') ||
      triggerMessage.content.toLowerCase().includes('anyone')
    );
    
    if (userNeedsHelp) {
      console.log(`[AGENT-BUS] User needs help - ${agentId} can override state restrictions`);
      // Don't return here, let it go through normal AI decision process
    } else {
      // If agent is in 'done' state, only respond if explicitly involved
      if (context.currentAction === 'done' && !triggerMessage.mentions.includes(agentId) && 
          (!triggerMessage.involve || !triggerMessage.involve.includes(agentId))) {
        console.log(`[AGENT-BUS] Agent ${agentId} is done, not responding unless explicitly involved`);
        return false;
      }
      
      // If agent is waiting for specific agents, check if they responded
      if (context.currentAction === 'waiting' && context.metadata?.waitingFor?.length) {
        const waitingForResponded = context.metadata.waitingFor.some((waitingId: string) => 
          triggerMessage.author === waitingId
        );
        if (!waitingForResponded) {
          console.log(`[AGENT-BUS] Agent ${agentId} is waiting for ${context.metadata.waitingFor.join(', ')}`);
          return false;
        }
      }
    }
    
    // Check if agent responded recently (reasonable cooldown)
    if (context.lastResponseTime) {
      const timeSinceLastResponse = Date.now() - context.lastResponseTime.getTime();
      
      // Allow immediate response if message is from another agent and potentially important
      const isImportantAgentMessage = triggerMessage.messageType === 'agent' && 
                                      triggerMessage.author !== agentId && 
                                      (triggerMessage.content.includes('?') || 
                                       triggerMessage.content.includes('```') ||
                                       triggerMessage.content.includes('implement') ||
                                       triggerMessage.content.includes('created') ||
                                       triggerMessage.content.includes('finished') ||
                                       triggerMessage.mentions.includes(agentId) ||
                                       (triggerMessage.involve && triggerMessage.involve.includes(agentId)));
      
      // Don't let agents respond more than once every 2 seconds UNLESS it's an important message
      if (timeSinceLastResponse < 2000 && !isImportantAgentMessage) {
        console.log(`[AGENT-BUS] Agent ${agentId} responded ${timeSinceLastResponse}ms ago, brief cooldown`);
        return false;
      }
      
      // Check if agent has been too active recently (very lenient - encourage participation)
      const recentMessages = this.globalMessageHistory.slice(-10);
      const recentOwnMessages = recentMessages.filter(msg => msg.author === agentId);
      
      // Only limit if agent severely dominates the conversation (6+ messages in last 10)
      if (recentOwnMessages.length >= 6) {
        console.log(`[AGENT-BUS] Agent ${agentId} has ${recentOwnMessages.length} recent messages, taking a short break`);
        return false;
      }
    }

    // Special case: New agents (like Clawsy) should respond immediately when mentioned
    if (context.personalMessageHistory.length <= 1) {
      console.log(`[AGENT-BUS] New agent ${agentId} responding immediately to get oriented`);
      return true;
    }
    
    // Special case: Cortex should coordinate but not dominate - be more selective
    if (agentId === 'cortex') {
      // CRITICAL: Cortex MUST respond to the first user message immediately
      const userMessages = this.globalMessageHistory.filter(msg => msg.author === 'user');
      if (userMessages.length === 1 && triggerMessage.author === 'user') {
        console.log(`[AGENT-BUS] Cortex MUST respond to first user message - immediate response`);
        return true;
      }
      
      const messageContent = triggerMessage.content.toLowerCase();
      const senderAgent = agents.find(a => a.id === triggerMessage.author);
      
      const shouldCortexRespond =
        // When user explicitly asks for help or coordination
        (triggerMessage.messageType === 'user' && (
          messageContent.includes('help') ||
          messageContent.includes('who should') ||
          messageContent.includes('what should') ||
          messageContent.includes('how do') ||
          messageContent.includes('coordinate') ||
          messageContent.includes('manage')
        )) ||
        // When conversation truly stalls (multiple agents report done but user hasn't acknowledged)
        (messageContent.includes('nothing') && this.getActiveAgentCount() === 1) ||
        // Direct mentions of Cortex
        messageContent.includes('cortex') ||
        // When user provides feedback after deliverables (needs coordination)
        (triggerMessage.author === 'user' && context.lastResponseTime && 
         this.globalMessageHistory.some(msg => msg.author !== 'user' && msg.author !== 'cortex' && 
                                        msg.timestamp > context.lastResponseTime!)) ||
        userNeedsHelp;
      
      if (shouldCortexRespond) {
        console.log(`[AGENT-BUS] Cortex responding to coordination/user request`);
        return true;
      } else {
        console.log(`[AGENT-BUS] Cortex staying back to let team respond first`);
      }
    }

    // Use AI to decide if agent should respond
    console.log(`[AGENT-BUS] Agent ${agentId} going through AI decision process for message: "${triggerMessage.content.substring(0, 50)}..."`);
    const aiDecision = await this.aiDecisionToRespond(agentId, triggerMessage);
    if (!aiDecision) {
      console.log(`[AGENT-BUS] Agent ${agentId} AI decided NOT to respond`);
    }
    return aiDecision;
  }

  private async aiDecisionToRespond(agentId: string, triggerMessage: BusMessage): Promise<boolean> {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return false;

    const context = this.agentContexts.get(agentId);
    
    // For observer agents without context, use global history for decision making
    let contextMessages: BusMessage[];
    if (!context) {
      // Use recent global messages for agents that haven't joined yet
      contextMessages = this.globalMessageHistory.slice(-5);
    } else {
      contextMessages = context.personalMessageHistory.slice(-5);
    }

    // Build context from appropriate message history
    const contextStr = contextMessages.map(msg => {
      const authorName = msg.author === 'user' ? 'User' : 
                        agents.find(a => a.id === msg.author)?.name || msg.author;
      return `${authorName}: ${msg.content}`;
    }).join('\n');
    
    // Get agent's own recent messages to check for repetition
    const myRecentMessages = this.globalMessageHistory
      .filter(msg => msg.author === agentId)
      .slice(-3);
    const myRecentContent = myRecentMessages
      .map(msg => msg.content.substring(0, 100))
      .join(' | ');

    // First, try the local LabRats backend for fast decision making
    const labRatsBackend = getLabRatsBackend();
    
    console.log(`[AGENT-BUS] LabRats backend availability: ${labRatsBackend.available}`);
    
    if (labRatsBackend.available) {
      console.log(`[AGENT-BUS] Using local LabRats backend for ${agentId} decision`);
      
      try {
        // Special handling for observer agents (Ziggy and Scratchy) - STRICT JOINING CRITERIA
        const isObserverAgent = agentId === 'ziggy' || agentId === 'scratchy';
        let observerGuidance = '';
        
        if (isObserverAgent) {
          // Check if they were explicitly mentioned or invited
          const wasInvited = this.globalMessageHistory.some(msg => 
            msg.mentions.includes(agentId) || 
            (msg.involve && msg.involve.includes(agentId))
          );
          
          if (!wasInvited) {
            console.log(`[AGENT-BUS] Observer agent ${agentId} not invited - will not join`);
            return false; // Don't even ask the backend if not invited
          }
          
          observerGuidance = `\n\nIMPORTANT: You were INVITED to join this conversation. Only join if:
1. You can add significant value with your expertise
2. The conversation needs your specific perspective
3. You have something meaningful to contribute

You were invited, so you should join if you can help. But still be selective about when to actually respond.`;
        }
        
        // Get agent persona for better decision making
        const agentPersona = await this.promptManager.getPrompt(agentId);
        
        const decisionResponse = await labRatsBackend.shouldAgentRespond({
          conversationId: this.conversationId,
          agentId,
          agentName: agent.name,
          agentTitle: agent.title + observerGuidance,
          agentPersona,
          message: triggerMessage.content,
          messageAuthor: triggerMessage.author,
          conversationContext: contextStr,
          agentRecentMessages: myRecentContent
        });

        if (decisionResponse.success) {
          console.log(`[AGENT-BUS] Agent ${agentId} local decision: ${decisionResponse.shouldRespond} (${decisionResponse.reasoning})`);
          return decisionResponse.shouldRespond;
        } else {
          console.log(`[AGENT-BUS] Local backend failed for ${agentId}, agent will not respond`);
          return false;
        }
      } catch (error) {
        console.error(`[AGENT-BUS] Error with local backend for ${agentId}, agent will not respond:`, error);
        return false;
      }
    }

    // No backend available - agents cannot make decisions
    console.log(`[AGENT-BUS] No backend available for ${agentId} - agent cannot respond`);
    return false;
  }

  // Queue management methods
  private addToResponseQueue(agentId: string, triggerMessage: BusMessage): void {
    // Prevent duplicates - if agent is already in queue, don't add again
    const isAlreadyQueued = this.responseQueue.some(item => item.agentId === agentId);
    if (!isAlreadyQueued) {
      // Capture context snapshot at decision time
      const contextSnapshot = [...this.globalMessageHistory]; // Deep copy of current context
      this.responseQueue.push({
        agentId,
        triggerMessage,
        contextSnapshot
      });
      console.log(`[AGENT-BUS-QUEUE] Added ${agentId} to response queue with context snapshot (${contextSnapshot.length} messages). Queue: [${this.responseQueue.map(item => item.agentId).join(', ')}]`);
    } else {
      console.log(`[AGENT-BUS-QUEUE] Agent ${agentId} already in queue, skipping`);
    }
  }

  private removeFromResponseQueue(agentId: string): void {
    // Remove ALL instances of this agent from the queue
    const originalLength = this.responseQueue.length;
    this.responseQueue = this.responseQueue.filter(item => item.agentId !== agentId);
    const removedCount = originalLength - this.responseQueue.length;
    if (removedCount > 0) {
      console.log(`[AGENT-BUS-QUEUE] Removed ${removedCount} instances of ${agentId} from queue. Queue: [${this.responseQueue.map(item => item.agentId).join(', ')}]`);
    }
  }

  private isAgentInQueue(agentId: string): boolean {
    return this.responseQueue.some(item => item.agentId === agentId);
  }

  private getActiveAgentCount(): number {
    return Array.from(this.agentContexts.entries()).filter(([_, ctx]) => ctx.isActive).length;
  }

  private extractGoalsFromCortexResponse(content: string): string[] {
    const goals: string[] = [];
    
    // Look specifically for USER-FOCUSED goals that Cortex should define
    const userGoalPatterns = [
      /(?:user wants|user needs|user asked for|user goal|user requirement).*?:\s*(.+)/gi,
      /(?:main goal|primary objective|core requirement).*?:\s*(.+)/gi,
      /(?:deliver|create|build|provide).*?:\s*(.+?)(?:\s+for\s+(?:the\s+)?user|$)/gi,
    ];

    for (const pattern of userGoalPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const goalText = match[1].trim();
        // Filter out technical implementation details
        if (goalText.length > 10 && goalText.length < 150 && 
            !this.isTechnicalImplementation(goalText)) {
          goals.push(goalText);
        }
      }
    }

    // Look for explicit goal statements in numbered lists (but filter technical ones)
    const numberedGoals = content.match(/^\d+\.\s+(.+)$/gm);
    if (numberedGoals) {
      numberedGoals.forEach(goal => {
        const cleanGoal = goal.replace(/^\d+\.\s+/, '').trim();
        if (cleanGoal.length > 10 && cleanGoal.length < 150 && 
            !this.isTechnicalImplementation(cleanGoal)) {
          goals.push(cleanGoal);
        }
      });
    }

    return [...new Set(goals)]; // Remove duplicates
  }

  private isTechnicalImplementation(text: string): boolean {
    const technicalKeywords = [
      'tech stack', 'technology', 'framework', 'library', 'pygame', 'python',
      'architecture', 'database', 'api', 'backend', 'frontend', 'deployment',
      'testing', 'security', 'performance', 'scalability', 'infrastructure',
      'code', 'implementation', 'development', 'programming'
    ];
    
    const lowerText = text.toLowerCase();
    return technicalKeywords.some(keyword => lowerText.includes(keyword));
  }

  private addGoalsToConversation(goals: string[]): void {
    goals.forEach(goal => {
      if (!this.conversationGoals.includes(goal)) {
        this.conversationGoals.push(goal);
        console.log(`[AGENT-BUS-GOALS] Added goal: ${goal}`);
      }
    });
    
    if (goals.length > 0 && !this.goalsEstablished) {
      this.goalsEstablished = true;
      console.log(`[AGENT-BUS-GOALS] Goals established for conversation: ${this.conversationGoals.length} goals`);
    }
  }

  private async processResponseQueue(): Promise<void> {
    if (this.queueProcessing || this.responseQueue.length === 0) {
      return;
    }

    this.queueProcessing = true;
    console.log(`[AGENT-BUS-QUEUE] Processing response queue with ${this.responseQueue.length} agents`);

    while (this.responseQueue.length > 0 && this.busActive && this.agentsActive) {
      const queueItem = this.responseQueue.shift()!;
      const { agentId, triggerMessage, contextSnapshot } = queueItem;
      console.log(`[AGENT-BUS-QUEUE] Processing response for ${agentId} using context snapshot from decision time`);

      // Remove any other instances of this agent from the queue
      this.removeFromResponseQueue(agentId);

      // Show typing indicator
      this.emit('agent-typing', { agentId, isTyping: true });

      try {
        // Use context snapshot from decision time
        await this.invokeAgentFromQueue(agentId, triggerMessage, contextSnapshot);
      } catch (error) {
        console.error(`[AGENT-BUS-QUEUE] Error processing ${agentId}:`, error);
      }

      // Hide typing indicator
      this.emit('agent-typing', { agentId, isTyping: false });

      // Small delay between queue responses to make it feel natural
      if (this.responseQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      }
    }

    this.queueProcessing = false;
    console.log(`[AGENT-BUS-QUEUE] Queue processing completed`);
  }

  private async invokeAgentFromQueue(agentId: string, triggerMessage: BusMessage, contextSnapshot: BusMessage[]): Promise<void> {
    const agent = agents.find(a => a.id === agentId);
    const context = this.agentContexts.get(agentId);
    
    if (!agent || !context) {
      console.error(`[AGENT-BUS-QUEUE] Agent ${agentId} not found or no context`);
      return;
    }

    console.log(`[AGENT-BUS-QUEUE] Invoking ${agentId} with context snapshot from decision time (${contextSnapshot.length} messages vs ${this.globalMessageHistory.length} current messages)`);
    
    // Use the existing invoke logic but with context snapshot from decision time
    await this.invokeAgentWithContextSnapshot(agentId, triggerMessage, contextSnapshot, 'natural');
  }

  private async invokeAgent(agentId: string, triggerMessage: BusMessage, responseType: 'mentioned' | 'natural'): Promise<void> {
    // Don't invoke agents if they're paused
    if (!this.agentsActive) {
      console.log(`[AGENT-BUS] Skipping agent ${agentId} invocation - agents are paused`);
      return;
    }
    
    const agent = agents.find(a => a.id === agentId);
    const context = this.agentContexts.get(agentId);
    
    if (!agent || !context) {
      console.error(`[AGENT-BUS] Agent ${agentId} not found or no context`);
      return;
    }

    // Special handling for goal completion - Cortex should pause the bus
    if (triggerMessage.messageType === 'system' && agentId === 'cortex' && 
        triggerMessage.content.includes('CRITICAL')) {
      console.log(`[AGENT-BUS] Goal completion detected - Cortex will summarize and pause bus`);
      
      // Cortex summarizes the delivery and pauses the bus
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      const completionPrompt = `${systemPrompt}

SYSTEM: The user's goal has been completed. You must now:
1. Provide a brief summary of what was delivered
2. Confirm the user can now achieve their goal
3. Set your action to "done" 
4. The conversation will automatically pause after your response

Do NOT continue the conversation. Do NOT ask what's next. This is the final summary.`;
      
      const agentContext = this.buildAgentSpecificContext(agentId, responseType, triggerMessage);
      
      try {
        const response = await this.callAgentWithIsolatedSession(agentId, agentContext, completionPrompt);
        
        if (response.success && response.message) {
          const agentMessage: BusMessage = {
            id: this.generateId(),
            content: response.message.content,
            author: agentId,
            timestamp: new Date(),
            mentions: [],
            messageType: 'agent',
            sessionId: context.sessionId,
            action: 'done',
            involve: [],
            metadata: {}
          };
          
          // Update context
          context.lastResponseTime = new Date();
          context.currentAction = 'done';
          
          // Publish the summary message
          await this.publishMessage(agentMessage);
          
          // Automatically pause the bus after Cortex summarizes
          setTimeout(() => {
            console.log(`[AGENT-BUS] Auto-pausing bus after Cortex completion summary`);
            this.pause();
          }, 1000);
          
          return;
        }
      } catch (error) {
        console.error(`[AGENT-BUS] Error in completion summary:`, error);
      }
      
      return;
    }

    console.log(`[AGENT-BUS] 🎯 Invoking agent ${agentId} (${responseType} response) for trigger: "${triggerMessage.content.substring(0, 50)}..."`);

    try {
      const context = this.agentContexts.get(agentId);
      if (!context) {
        console.error(`[AGENT-BUS] No context found for agent ${agentId}`);
        return;
      }
      
      let systemPrompt: string;
      
      // Only send full prompt on first invocation
      if (!context.promptInitialized) {
        systemPrompt = await this.promptManager.getPrompt(agentId);
        context.promptInitialized = true;
        console.log(`[AGENT-BUS] First invocation for ${agentId} - sending full prompt`);
      } else {
        // For subsequent invocations, just send minimal context
        const agent = agents.find(a => a.id === agentId);
        systemPrompt = `You are ${agent?.name || agentId}. Continue the conversation based on the context provided.

Your current session: ${context.sessionId}

Actions: planning, open, waiting, implementing, needs_review, reviewing, done, user_input, wait_for_user
Use "involve" field to mention other agents when needed.

${this.mcpReady ? `
Available MCP Tools:
- list_files: List files and directories in the project
  Usage: [[mcp:list_files {"path": "src", "recursive": true}]]
  
When you need to explore files or understand the project structure, use MCP tools.
` : ''}

Respond with structured output containing: message, action, involve (array), metadata.`;
        console.log(`[AGENT-BUS] Subsequent invocation for ${agentId} - sending minimal prompt`);
      }
      
      const agentContext = this.buildAgentSpecificContext(agentId, responseType, triggerMessage);
      
      // Store the prompt and context for POV mode
      context.lastSystemPrompt = systemPrompt;
      context.lastContext = agentContext;
      
      const response = await this.callAgentWithIsolatedSession(agentId, agentContext, systemPrompt);
      
      if (response.success && response.message) {
        // Store raw response for POV mode
        context.lastRawResponse = response.message.content;
        
        // Process any MCP tool calls in the response
        const processedContent = await this.processMcpToolCalls(response.message.content);
        
        // Get structured response if available
        const structured = (response.message as any).structuredResponse || {
          message: processedContent,
          action: 'open',
          involve: [],
          metadata: {}
        };
        
        const agentMessage: BusMessage = {
          id: this.generateId(),
          content: processedContent,
          author: agentId,
          timestamp: new Date(),
          mentions: this.extractMentions(processedContent),
          messageType: 'agent',
          sessionId: context!.sessionId,
          action: structured.action,
          involve: structured.involve || [],
          metadata: structured.metadata
        };

        // Update agent's last response time and current action
        context!.lastResponseTime = new Date();
        context!.currentAction = structured.action;
        
        // Update agent's metadata
        if (structured.metadata) {
          context!.metadata = { ...context!.metadata, ...structured.metadata };
        }
        
        // Activate any newly mentioned agents
        for (const mentionedId of agentMessage.mentions) {
          if (agents.find(a => a.id === mentionedId)) {
            await this.createAgentContext(mentionedId);
          }
        }
        
        // Check if agent wants to involve labrats (user) - automatically convert to wait_for_user
        if (structured.involve && structured.involve.includes('labrats')) {
          console.log(`[AGENT-BUS] Agent ${agentId} mentioned @labrats - converting to wait_for_user action`);
          structured.action = 'wait_for_user';
          agentMessage.action = 'wait_for_user';
          context.currentAction = 'wait_for_user';
        }

        // Activate agents specified in the "involve" field (excluding labrats since it's the user)
        if (structured.involve && structured.involve.length > 0) {
          const agentInvolve = structured.involve.filter((id: string) => id !== 'labrats');
          if (agentInvolve.length > 0) {
            console.log(`[AGENT-BUS] Agent ${agentId} wants to involve: ${agentInvolve.join(', ')}`);
            for (const involveId of agentInvolve) {
              if (agents.find(a => a.id === involveId)) {
                await this.createAgentContext(involveId);
                // Add them to mentions so they get notified
                if (!agentMessage.mentions.includes(involveId)) {
                  agentMessage.mentions.push(involveId);
                }
              }
            }
          }
        }

        // Extract goals if this is Cortex speaking
        if (agentId === 'cortex') {
          const extractedGoals = this.extractGoalsFromCortexResponse(response.message.content);
          if (extractedGoals.length > 0) {
            this.addGoalsToConversation(extractedGoals);
          }
        }

        // Publish the message to the bus
        await this.publishMessage(agentMessage);
        
        // Check if agent wants to wait for user input
        if (structured.action === 'wait_for_user') {
          console.log(`[AGENT-BUS] Agent ${agentId} requested to wait for user input - pausing bus`);
          
          // Show OS notification to alert user
          const agentInfo = agents.find(a => a.id === agentId);
          const agentName = agentInfo?.name || agentId;
          await notificationService.showAgentWaitingNotification(agentName, response.message.content);
          
          this.pause();
          return;
        }
        
        // Check if all agents are done (trigger QA)
        await this.checkAllAgentsDone();
        
        console.log(`[AGENT-BUS] ✅ Agent ${agentId} published response with action: ${structured.action}`);
      } else {
        console.log(`[AGENT-BUS] ❌ Agent ${agentId} failed to generate response`);
      }
    } catch (error) {
      console.error(`[AGENT-BUS] Error invoking agent ${agentId}:`, error);
      // Add agent to failed set
      this.failedAgents.add(agentId);
      console.log(`[AGENT-BUS] Added ${agentId} to failed agents set`);
      
      // Notify Cortex if this was a mentioned agent
      if (responseType === 'mentioned' && agentId !== 'cortex') {
        await this.notifyCortexOfFailedAgent(agentId, triggerMessage);
      }
    }
  }

  private async invokeAgentWithContextSnapshot(agentId: string, triggerMessage: BusMessage, contextSnapshot: BusMessage[], responseType: 'mentioned' | 'natural'): Promise<void> {
    // Don't invoke agents if they're paused
    if (!this.agentsActive) {
      console.log(`[AGENT-BUS] Skipping agent ${agentId} invocation - agents are paused`);
      return;
    }
    
    // Skip if agent has failed
    if (this.failedAgents.has(agentId)) {
      console.log(`[AGENT-BUS] Skipping agent ${agentId} - previously failed`);
      return;
    }
    
    const agent = agents.find(a => a.id === agentId);
    const context = this.agentContexts.get(agentId);
    
    if (!agent || !context) {
      console.error(`[AGENT-BUS] Agent ${agentId} not found or no context`);
      return;
    }

    console.log(`[AGENT-BUS] 🎯 Invoking agent ${agentId} (${responseType} response) with context snapshot from decision time`);

    try {
      let systemPrompt: string;
      
      // Only send full prompt on first invocation
      if (!context.promptInitialized) {
        systemPrompt = await this.promptManager.getPrompt(agentId);
        context.promptInitialized = true;
        console.log(`[AGENT-BUS] First invocation for ${agentId} - sending full prompt`);
      } else {
        // For subsequent invocations, just send minimal context
        systemPrompt = `You are ${agent.name}. Continue the conversation based on the context provided.

Your current session: ${context.sessionId}

Actions: planning, open, waiting, implementing, needs_review, reviewing, done, user_input, wait_for_user
Use "involve" field to mention other agents when needed.

Respond with structured output containing: message, action, involve (array), metadata.`;
        console.log(`[AGENT-BUS] Subsequent invocation for ${agentId} - sending minimal prompt`);
      }
      
      const agentContext = this.buildAgentSpecificContextFromSnapshot(agentId, responseType, triggerMessage, contextSnapshot);
      
      // Store the prompt and context for POV mode
      context.lastSystemPrompt = systemPrompt;
      context.lastContext = agentContext;
      
      const response = await this.callAgentWithIsolatedSession(agentId, agentContext, systemPrompt);
      
      if (response.success && response.message) {
        // Store raw response for POV mode
        context.lastRawResponse = response.message.content;
        
        // Process any MCP tool calls in the response
        const processedContent = await this.processMcpToolCalls(response.message.content);
        
        // Get structured response if available
        const structured = (response.message as any).structuredResponse || {
          message: processedContent,
          action: 'open',
          involve: [],
          metadata: {}
        };
        
        const agentMessage: BusMessage = {
          id: this.generateId(),
          content: processedContent,
          author: agentId,
          timestamp: new Date(),
          mentions: this.extractMentions(processedContent),
          messageType: 'agent',
          sessionId: context!.sessionId,
          action: structured.action,
          involve: structured.involve,
          metadata: structured.metadata
        };

        // Update context
        context!.lastResponseTime = new Date();
        context!.currentAction = structured.action;
        context!.metadata = structured.metadata;
        
        // Check if agent wants to involve labrats (user) - automatically convert to wait_for_user
        if (structured.involve && structured.involve.includes('labrats')) {
          console.log(`[AGENT-BUS] Agent ${agentId} mentioned @labrats - converting to wait_for_user action`);
          structured.action = 'wait_for_user';
          agentMessage.action = 'wait_for_user';
          context!.currentAction = 'wait_for_user';
        }

        // Activate agents specified in the "involve" field (excluding labrats since it's the user)
        if (structured.involve && structured.involve.length > 0) {
          const agentInvolve = structured.involve.filter((id: string) => id !== 'labrats');
          if (agentInvolve.length > 0) {
            console.log(`[AGENT-BUS] Agent ${agentId} wants to involve: ${agentInvolve.join(', ')}`);
            for (const involveId of agentInvolve) {
              if (agents.find(a => a.id === involveId)) {
                await this.createAgentContext(involveId);
                // Add them to mentions so they get notified
                if (!agentMessage.mentions.includes(involveId)) {
                  agentMessage.mentions.push(involveId);
                }
              }
            }
          }
        }

        // Extract goals if this is Cortex speaking
        if (agentId === 'cortex') {
          const extractedGoals = this.extractGoalsFromCortexResponse(response.message.content);
          if (extractedGoals.length > 0) {
            this.addGoalsToConversation(extractedGoals);
          }
        }

        // Publish the message to the bus
        await this.publishMessage(agentMessage);
        
        // Check if agent wants to wait for user input
        if (structured.action === 'wait_for_user') {
          console.log(`[AGENT-BUS] Agent ${agentId} requested to wait for user input - pausing bus`);
          
          // Show OS notification to alert user
          const agentInfo = agents.find(a => a.id === agentId);
          const agentName = agentInfo?.name || agentId;
          await notificationService.showAgentWaitingNotification(agentName, response.message.content);
          
          this.pause();
          return;
        }
        
        // Check if all agents are done (trigger QA)
        await this.checkAllAgentsDone();
        
        console.log(`[AGENT-BUS] ✅ Agent ${agentId} published response with action: ${structured.action}`);
      } else {
        console.log(`[AGENT-BUS] ❌ Agent ${agentId} failed to generate response`);
      }
    } catch (error) {
      console.error(`[AGENT-BUS] Error invoking agent ${agentId}:`, error);
      // Add agent to failed set
      this.failedAgents.add(agentId);
      console.log(`[AGENT-BUS] Added ${agentId} to failed agents set`);
      
      // Notify Cortex if this was a mentioned agent
      if (responseType === 'mentioned' && agentId !== 'cortex') {
        await this.notifyCortexOfFailedAgent(agentId, triggerMessage);
      }
    }
  }

  private async notifyCortexOfFailedAgent(failedAgentId: string, originalMessage: BusMessage): Promise<void> {
    const failedAgent = agents.find(a => a.id === failedAgentId);
    if (!failedAgent) return;
    
    // Create a system message for Cortex
    const systemMessage: BusMessage = {
      id: this.generateId(),
      content: `⚠️ ${failedAgent.name} failed to respond when mentioned. They may be experiencing technical issues. Please proceed without them or assign their tasks to another team member.`,
      author: 'system',
      timestamp: new Date(),
      mentions: ['cortex'],
      messageType: 'system'
    };
    
    await this.publishMessage(systemMessage);
  }

  private buildAgentSpecificContext(agentId: string, responseType: 'mentioned' | 'natural', triggerMessage: BusMessage): string {
    const context = this.agentContexts.get(agentId);
    if (!context) return '';

    const activeAgentList = Array.from(this.agentContexts.entries())
      .filter(([_, ctx]) => ctx.isActive)
      .map(([id, _]) => agents.find(a => a.id === id))
      .filter(Boolean)
      .map(agent => `${agent!.name} (${agent!.title})`)
      .join(', ');

    let contextStr = `Active team members on the bus: ${activeAgentList}\n`;
    contextStr += `Your session ID: ${context.sessionId}\n`;
    
    // Add goal tracking for Cortex
    if (agentId === 'cortex') {
      if (this.conversationGoals.length > 0) {
        contextStr += `\n🎯 CONVERSATION GOALS (defined earlier):\n`;
        this.conversationGoals.forEach((goal, index) => {
          contextStr += `${index + 1}. ${goal}\n`;
        });
        contextStr += `\n⚠️  CRITICAL: Before marking "done", verify ALL goals above are ACTUALLY completed!\n`;
      } else {
        contextStr += `\n🎯 GOALS NOT YET DEFINED: Please define clear, specific goals based on the user's request before proceeding.\n`;
      }
    }
    contextStr += `\n`;
    
    // Add messages that happened since this agent's last response
    const messagesSinceLastResponse = this.getMessagesSinceLastResponse(agentId);
    if (messagesSinceLastResponse.length > 0) {
      contextStr += `📬 NEW MESSAGES since your last response:\n`;
      for (const msg of messagesSinceLastResponse) {
        const authorName = msg.author === 'user' ? 'User' : 
                          agents.find(a => a.id === msg.author)?.name || msg.author;
        contextStr += `${authorName}: ${msg.content}\n`;
      }
      contextStr += `\n`;
    }
    
    // Add pre-prompt for agent-to-agent messages with actionable feedback
    const prePrompt = this.generatePrePrompt(agentId, triggerMessage);
    if (prePrompt) {
      contextStr += `🎯 IMPORTANT CONTEXT: ${prePrompt}\n\n`;
    }
    
    if (responseType === 'mentioned') {
      contextStr += `🔥 You were mentioned in this message: "${triggerMessage.content}"\n\n`;
      
      // If this is a new agent being mentioned, give them ALL relevant context from the conversation
      if (context.personalMessageHistory.length === 0) {
        contextStr += `📚 FULL CONVERSATION CONTEXT (you're joining now):\n`;
        
        // Give new agents MORE context - especially for code review scenarios
        const contextSize = agentId === 'clawsy' ? 15 : 10; // Code reviewers need more context
        const recentGlobalMessages = this.globalMessageHistory.slice(-Math.min(contextSize, this.globalMessageHistory.length));
        
        // Prioritize technical content, code blocks, and actionable requests for the joining agent
        const relevantMessages = this.prioritizeRelevantMessages(recentGlobalMessages, agentId);
        
        // IMPORTANT: Add these messages to the agent's personal history so they have context
        context.personalMessageHistory.push(...relevantMessages);
        
        for (const msg of relevantMessages) {
          const authorName = msg.author === 'user' ? 'User' : 
                            agents.find(a => a.id === msg.author)?.name || msg.author;
          contextStr += `${authorName}: ${msg.content}\n`;
        }
        
        // Special handling for Clawsy - ensure they see ALL code blocks
        if (agentId === 'clawsy') {
          const allCodeMessages = this.globalMessageHistory.filter(msg => msg.content.includes('```'));
          if (allCodeMessages.length > 0) {
            contextStr += `\n🔍 ALL CODE BLOCKS SHARED IN THIS SESSION:\n`;
            for (const codeMsg of allCodeMessages) {
              const authorName = agents.find(a => a.id === codeMsg.author)?.name || codeMsg.author;
              contextStr += `\n--- ${authorName} shared: ---\n${codeMsg.content}\n`;
            }
          }
        }
        
        // Add specific instruction if there's actionable content for this agent
        const actionableContent = this.detectActionableContent(recentGlobalMessages, agentId, triggerMessage);
        if (actionableContent) {
          contextStr += `\n🚨 IMMEDIATE ACTION NEEDED: ${actionableContent}\n`;
        }
      } else {
        contextStr += `Your personal message history:\n`;
        for (const msg of context.personalMessageHistory) {
          const authorName = msg.author === 'user' ? 'User' : 
                            agents.find(a => a.id === msg.author)?.name || msg.author;
          contextStr += `${authorName}: ${msg.content}\n`;
        }
      }
    } else {
      contextStr += `💬 You're responding naturally to the conversation.\n\n`;
      contextStr += `Your personal message history:\n`;
      for (const msg of context.personalMessageHistory) {
        const authorName = msg.author === 'user' ? 'User' : 
                          agents.find(a => a.id === msg.author)?.name || msg.author;
        contextStr += `${authorName}: ${msg.content}\n`;
      }
    }
    
    contextStr += `\nGuidelines:
- Keep responses concise and focused (1-2 sentences when possible)
- Only mention @other agents if you specifically need their expertise
- Avoid repeating what others have already said
- Focus on your unique contribution to the conversation

Remember: You're ${agents.find(a => a.id === agentId)?.name} with your own expertise. Add value based on your role as ${agents.find(a => a.id === agentId)?.title}.`;
    
    return contextStr;
  }

  private buildAgentSpecificContextFromSnapshot(agentId: string, responseType: 'mentioned' | 'natural', triggerMessage: BusMessage, contextSnapshot: BusMessage[]): string {
    const context = this.agentContexts.get(agentId);
    if (!context) return '';

    const activeAgentList = Array.from(this.agentContexts.entries())
      .filter(([_, ctx]) => ctx.isActive)
      .map(([id, _]) => agents.find(a => a.id === id))
      .filter(Boolean)
      .map(agent => `${agent!.name} (${agent!.title})`)
      .join(', ');

    let contextStr = `Active team members on the bus: ${activeAgentList}\n`;
    contextStr += `Your session ID: ${context.sessionId}\n`;
    
    // Add goal tracking for Cortex
    if (agentId === 'cortex') {
      if (this.conversationGoals.length > 0) {
        contextStr += `\n🎯 CONVERSATION GOALS (defined earlier):\n`;
        this.conversationGoals.forEach((goal, index) => {
          contextStr += `${index + 1}. ${goal}\n`;
        });
        contextStr += `\n⚠️  CRITICAL: Before marking "done", verify ALL goals above are ACTUALLY completed!\n`;
      } else {
        contextStr += `\n🎯 GOALS NOT YET DEFINED: Please define clear, specific goals based on the user's request before proceeding.\n`;
      }
    }
    contextStr += `\n`;
    
    // Use context snapshot from decision time instead of current state
    contextStr += `📸 CONTEXT SNAPSHOT from when you decided to respond:\n`;
    for (const msg of contextSnapshot) {
      const authorName = msg.author === 'user' ? 'User' : 
                        agents.find(a => a.id === msg.author)?.name || msg.author;
      contextStr += `${authorName}: ${msg.content}\n`;
    }
    
    // Special handling for Clawsy - ensure they see ALL code blocks from snapshot
    if (agentId === 'clawsy') {
      const allCodeMessages = contextSnapshot.filter(msg => msg.content.includes('```'));
      if (allCodeMessages.length > 0) {
        contextStr += `\n🔍 ALL CODE BLOCKS SHARED IN THIS SESSION (from snapshot):\n`;
        for (const codeMsg of allCodeMessages) {
          const authorName = agents.find(a => a.id === codeMsg.author)?.name || codeMsg.author;
          contextStr += `\n--- ${authorName} shared: ---\n${codeMsg.content}\n`;
        }
      }
    }
    
    contextStr += `\nGuidelines:
- Keep responses concise and focused (1-2 sentences when possible)
- Only mention @other agents if you specifically need their expertise
- Avoid repeating what others have already said
- Focus on your unique contribution to the conversation

Remember: You're ${agents.find(a => a.id === agentId)?.name} with your own expertise. Add value based on your role as ${agents.find(a => a.id === agentId)?.title}.`;
    
    return contextStr;
  }

  private getMessagesSinceLastResponse(agentId: string): BusMessage[] {
    const context = this.agentContexts.get(agentId);
    if (!context || !context.lastResponseTime) {
      // If agent has never responded, return all messages
      return this.globalMessageHistory.slice();
    }
    
    // Get messages that happened after this agent's last response
    return this.globalMessageHistory.filter(msg => 
      msg.timestamp > context.lastResponseTime! &&
      msg.author !== agentId // Exclude their own messages
    );
  }

  private generatePrePrompt(agentId: string, triggerMessage: BusMessage): string | null {
    // Special handling for user messages asking for progression
    if (triggerMessage.messageType === 'user') {
      const content = triggerMessage.content.toLowerCase();
      if (content.includes('continue') || content.includes('don\'t stop') || 
          content.includes('already said') || content.includes('repeating')) {
        return '⚠️ The user is asking for PROGRESSION, not repetition. You MUST provide NEW content: actual code implementation, specific technical details, or concrete next steps. Do NOT repeat what you\'ve already said. Move the conversation FORWARD with implementation details.';
      }
      return null;
    }
    
    // Skip if message is from the same agent
    if (triggerMessage.author === agentId) {
      return null;
    }
    
    // CRITICAL: Code review requests for Clawsy - HIGHEST PRIORITY
    if (agentId === 'clawsy') {
      const content = triggerMessage.content.toLowerCase();
      const isReviewRequest = content.includes('review') || 
                             content.includes('@clawsy') || 
                             content.includes('feedback') ||
                             content.includes('quality') ||
                             content.includes('clawsy');
      
      // Also trigger if Cortex is asking for review
      if (isReviewRequest || triggerMessage.author === 'cortex') {
        // Find all code blocks in recent messages
        const recentCodeMessages = this.globalMessageHistory.slice(-10)
          .filter(msg => msg.content.includes('```'))
          .map(msg => {
            const author = agents.find(a => a.id === msg.author)?.name || msg.author;
            return `\n${author}'s code:\n${msg.content}`;
          });
        
        if (recentCodeMessages.length > 0) {
          return `⚠️ CRITICAL CODE REVIEW REQUIRED - DO NOT DELAY!

You were asked to review code. DO NOT say "I'll review" or "Let me review" or "Please share the code".

The code is ALREADY SHARED above. Review it NOW:
${recentCodeMessages.join('\n---\n')}

Your review MUST include:
1. At least 3-5 specific points
2. Line-by-line feedback (e.g., "Line 15: Missing GRID_SIZE constant")
3. Both issues AND what's done well
4. Concrete suggestions for improvement

Example format:
**Reviewing Patchy's backend code:**
- Line 3: Missing GRID_SIZE constant definition
- Line 20: place_food() not implemented
- Good: Clean separation of game logic

**Reviewing Shiny's frontend:**
- Issue: No game loop implementation
- Missing: Snake movement logic
- Good: Clear canvas setup

START YOUR REVIEW NOW!`;
        }
      }
    }

    const messageContent = triggerMessage.content.toLowerCase();
    const senderAgent = agents.find(a => a.id === triggerMessage.author);
    const receivingAgent = agents.find(a => a.id === agentId);
    
    if (!senderAgent || !receivingAgent) return null;

    // Code review feedback detection
    if (this.isCodeReviewFeedback(messageContent, senderAgent, receivingAgent)) {
      return `This message contains code review feedback from ${senderAgent.name}. You are expected to consider this input carefully and implement the suggested changes if they are valid and improve the code quality. Take action on the feedback by making the necessary code modifications.`;
    }

    // Bug report or issue detection
    if (this.isBugReport(messageContent, senderAgent, receivingAgent)) {
      return `This message reports a bug or issue from ${senderAgent.name}. You should investigate and fix the reported problem. Acknowledge the issue and provide a solution or workaround.`;
    }

    // Security vulnerability feedback
    if (this.isSecurityFeedback(messageContent, senderAgent, receivingAgent)) {
      return `This message contains security feedback from ${senderAgent.name}. Security issues must be addressed immediately. Implement the recommended security measures and ensure the system is protected against the identified vulnerabilities.`;
    }

    // Testing feedback
    if (this.isTestingFeedback(messageContent, senderAgent, receivingAgent)) {
      return `This message contains testing feedback from ${senderAgent.name}. You should address any test failures, implement suggested test improvements, or fix issues that prevent proper testing of your code.`;
    }

    // Performance feedback
    if (this.isPerformanceFeedback(messageContent, senderAgent, receivingAgent)) {
      return `This message contains performance feedback from ${senderAgent.name}. You should optimize the code or architecture based on the performance concerns raised. Focus on improving efficiency and response times.`;
    }

    // Documentation feedback
    if (this.isDocumentationFeedback(messageContent, senderAgent, receivingAgent)) {
      return `This message contains documentation feedback from ${senderAgent.name}. You should improve or create the requested documentation to ensure the code and features are properly explained and accessible.`;
    }

    // General improvement suggestions
    if (this.isImprovementSuggestion(messageContent, senderAgent, receivingAgent)) {
      return `This message contains improvement suggestions from ${senderAgent.name}. Consider implementing these suggestions if they enhance the code quality, user experience, or system functionality.`;
    }
    
    // If someone just shared code, encourage discussion
    if (triggerMessage.content.includes('```')) {
      return `${senderAgent.name} just shared code implementation. Instead of asking for the code again, engage with what they've provided. Ask clarifying questions, suggest improvements, discuss trade-offs, or share how this integrates with your work. Build a collaborative technical discussion.`;
    }

    return null;
  }

  private isCodeReviewFeedback(content: string, sender: any, receiver: any): boolean {
    const codeReviewKeywords = [
      'code review', 'review', 'refactor', 'clean up', 'optimize', 'improve',
      'suggestion', 'recommendation', 'better approach', 'consider changing',
      'should use', 'instead of', 'replace', 'modify', 'update the code',
      'code quality', 'best practice', 'pattern', 'structure'
    ];
    
    // Typically code reviewers (like clawsy) giving feedback to developers
    const isReviewerToDeveloper = (sender.id === 'clawsy' || sender.title?.includes('Review')) &&
                                  (receiver.id === 'patchy' || receiver.id === 'shiny' || receiver.title?.includes('Developer'));
    
    return codeReviewKeywords.some(keyword => content.includes(keyword)) || isReviewerToDeveloper;
  }

  private isBugReport(content: string, sender: any, receiver: any): boolean {
    const bugKeywords = [
      'bug', 'error', 'issue', 'problem', 'broken', 'not working',
      'failing', 'crash', 'exception', 'fix', 'debug', 'resolve'
    ];
    
    return bugKeywords.some(keyword => content.includes(keyword));
  }

  private isSecurityFeedback(content: string, sender: any, receiver: any): boolean {
    const securityKeywords = [
      'security', 'vulnerability', 'exploit', 'unsafe', 'secure',
      'authentication', 'authorization', 'permission', 'encrypt',
      'sanitize', 'validate', 'sql injection', 'xss', 'csrf'
    ];
    
    const isSecurityExpert = sender.id === 'trappy' || sender.title?.includes('Security');
    
    return securityKeywords.some(keyword => content.includes(keyword)) || isSecurityExpert;
  }

  private isTestingFeedback(content: string, sender: any, receiver: any): boolean {
    const testKeywords = [
      'test', 'testing', 'unit test', 'integration test', 'coverage',
      'test case', 'assertion', 'mock', 'spec', 'should test'
    ];
    
    const isTester = sender.id === 'sniffy' || sender.title?.includes('Quality');
    
    return testKeywords.some(keyword => content.includes(keyword)) || isTester;
  }

  private isPerformanceFeedback(content: string, sender: any, receiver: any): boolean {
    const performanceKeywords = [
      'performance', 'slow', 'optimize', 'efficient', 'memory',
      'cpu', 'load time', 'response time', 'bottleneck', 'scale'
    ];
    
    return performanceKeywords.some(keyword => content.includes(keyword));
  }

  private isDocumentationFeedback(content: string, sender: any, receiver: any): boolean {
    const docKeywords = [
      'document', 'documentation', 'comment', 'readme', 'explain',
      'describe', 'clarify', 'instructions', 'guide', 'manual'
    ];
    
    const isDocumentationExpert = sender.id === 'quill' || sender.title?.includes('Document');
    
    return docKeywords.some(keyword => content.includes(keyword)) || isDocumentationExpert;
  }

  private isImprovementSuggestion(content: string, sender: any, receiver: any): boolean {
    const improvementKeywords = [
      'suggest', 'recommendation', 'improvement', 'enhance', 'better',
      'consider', 'maybe', 'could', 'might want to', 'how about'
    ];
    
    return improvementKeywords.some(keyword => content.includes(keyword));
  }

  private prioritizeRelevantMessages(messages: BusMessage[], agentId: string): BusMessage[] {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return messages;

    // Create a scoring system for message relevance
    const scoredMessages = messages.map(msg => {
      let score = 0;
      const content = msg.content.toLowerCase();
      
      // Higher score for code blocks - especially important for code reviewers
      if (msg.content.includes('```')) {
        score += agentId === 'clawsy' ? 10 : 5; // Code reviewers need ALL code
      }
      
      // Higher score for messages mentioning this agent's expertise
      if (agentId === 'clawsy' && (content.includes('review') || content.includes('code'))) score += 4;
      if (agentId === 'sniffy' && (content.includes('test') || content.includes('quality'))) score += 4;
      if (agentId === 'trappy' && (content.includes('security') || content.includes('auth'))) score += 4;
      if (agentId === 'patchy' && (content.includes('backend') || content.includes('api'))) score += 4;
      if (agentId === 'shiny' && (content.includes('frontend') || content.includes('ui'))) score += 4;
      if (agentId === 'sketchy' && (content.includes('design') || content.includes('ux') || content.includes('ui') || content.includes('user'))) score += 4;
      
      // For Clawsy, also prioritize implementation messages
      if (agentId === 'clawsy' && (content.includes('implement') || content.includes('function') || content.includes('class'))) score += 3;
      
      // Higher score for actionable requests
      if (content.includes('can you') || content.includes('please') || content.includes('should')) score += 3;
      
      // Higher score for technical terms
      if (content.includes('implement') || content.includes('create') || content.includes('build')) score += 2;
      
      // Always include recent user messages
      if (msg.messageType === 'user') score += 2;
      
      return { message: msg, score };
    });

    // Sort by score (highest first) and return messages
    // For code reviewers, ensure we include more messages
    const sortedMessages = scoredMessages.sort((a, b) => b.score - a.score);
    
    if (agentId === 'clawsy') {
      // Code reviewers should get ALL messages, not just top-scored ones
      return sortedMessages.map(item => item.message);
    }
    
    return sortedMessages.map(item => item.message);
  }

  private detectActionableContent(messages: BusMessage[], agentId: string, triggerMessage: BusMessage): string | null {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return null;

    // Look for specific actionable requests in recent messages
    for (const msg of messages.slice(-5)) {
      const content = msg.content.toLowerCase();
      
      // REMOVED: Duplicate Clawsy logic - handled below in dedicated section
      
      // Testing requests for Sniffy
      if (agentId === 'sniffy' && (content.includes('test') || content.includes('testing'))) {
        return 'There are testing requirements that need your attention. Please create appropriate test cases.';
      }
      
      // Security requests for Trappy
      if (agentId === 'trappy' && (content.includes('security') || content.includes('secure'))) {
        return 'There are security considerations that require your expertise. Please review and provide security recommendations.';
      }
      
      // REMOVED: Moved to generatePrePrompt for better positioning
      
      // Let Cortex make intelligent decisions about when to invite developers
      if (agentId === 'cortex' && triggerMessage.messageType === 'user') {
        return 'Analyze this user message carefully. If they are requesting implementation, code examples, technical work, or expressing frustration about lack of progress, you must IMMEDIATELY invite appropriate developers using @mentions. Be intelligent about recognizing implementation requests in any language or phrasing.';
      }
      
      // Backend/Frontend devs should wait when review is requested
      if ((agentId === 'patchy' || agentId === 'shiny') && 
          (content.includes('review') || content.includes('clawsy'))) {
        return '⚠️ STOP: Code review was requested on your ALREADY DELIVERED code. Do NOT output new code. Wait for Clawsy\'s feedback first. You can acknowledge the review request but don\'t provide more implementation.';
      }
      
      // Implementation requests for other agents
      if (content.includes('implement') || content.includes('create') || content.includes('build')) {
        const expertise = agent.title.toLowerCase();
        if (content.includes(expertise) || content.includes(agentId)) {
          return `There's an implementation request that matches your expertise as ${agent.title}. Start by discussing the approach and asking clarifying questions before providing implementation details.`;
        }
      }
    }
    
    // General collaborative prompt when code is shared
    if (triggerMessage.content.includes('```') && agentId !== triggerMessage.author) {
      const authorAgent = agents.find(a => a.id === triggerMessage.author);
      if (authorAgent) {
        return `${authorAgent.name} just shared code implementation. This is an opportunity for collaborative discussion. Ask questions about their approach, suggest improvements, discuss trade-offs, or share how this integrates with your area of expertise. Engage in meaningful technical discussion rather than just providing your own code version.`;
      }
    }

    return null;
  }

  private shouldTriggerAgentToAgentConversation(triggerMessage: BusMessage): boolean {
    const content = triggerMessage.content.toLowerCase();
    
    // Trigger responses for collaborative content
    const collaborativeKeywords = [
      'i\'ll design', 'i\'ll handle', 'i\'ll work on', 'i\'ll create', 'i\'ll implement',
      'once i have', 'let me know', 'share it for feedback', 'what do you think',
      'how does that sound', 'any thoughts', 'suggestions', 'feedback',
      'integrate', 'collaborate', 'work together', 'coordinate',
      'backend logic', 'frontend', 'user interface', 'api', 'database',
      'code', '```', 'implementation', 'structure', 'approach',
      'review', 'looks good', 'nice work', 'great', 'excellent',
      'thoughts on', 'what about', 'consider', 'maybe we', 'we could',
      'next step', 'moving forward', 'to build on', 'building on'
    ];
    
    // Trigger for promises to deliver code/work and follow-up discussions
    const deliveryPromises = [
      'i\'ll start', 'coming soon', 'will share', 'will provide', 'will create',
      'shortly', 'prototype', 'initial', 'draft', 'working on',
      'here\'s', 'here is', 'just finished', 'completed', 'done with',
      'ready for', 'delivered', 'implemented', 'created'
    ];
    
    // Detect when someone just shared code (may need discussion/review)
    const hasCodeBlock = triggerMessage.content.includes('```');
    const hasCodeDelivery = content.includes('here\'s') || content.includes('here is') || content.includes('implementation');
    
    if (hasCodeBlock && hasCodeDelivery) {
      return true; // Code was just shared, others might want to discuss/review
    }
    
    // Don't trigger for simple acknowledgments
    const simpleAcknowledgments = [
      'got it', 'absolutely', 'sure', 'okay', 'thanks', 'great'
    ];
    
    const hasCollaborativeContent = collaborativeKeywords.some(keyword => content.includes(keyword));
    const hasDeliveryPromise = deliveryPromises.some(keyword => content.includes(keyword));
    const isSimpleAcknowledgment = simpleAcknowledgments.some(keyword => content === keyword.trim() || content.startsWith(keyword + '!') || content.startsWith(keyword + ','));
    
    // Also trigger for questions directed at the team
    const hasQuestion = content.includes('?') && (
      content.includes('what') || content.includes('how') || content.includes('should') || 
      content.includes('can') || content.includes('would') || content.includes('any')
    );
    
    return (hasCollaborativeContent || hasDeliveryPromise || hasQuestion) && !isSimpleAcknowledgment;
  }

  private async createAgentContext(agentId: string): Promise<void> {
    // Always create a fresh context with new session ID for each chat session
    const context: AgentContext = {
      agentId,
      sessionId: `agent_${agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isActive: true,
      personalMessageHistory: [],
      lastResponseTime: null,
      currentAction: 'open', // Default state
      metadata: {}, // Initialize metadata object
      tokenUsage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 } // Initialize token usage
    };

    this.agentContexts.set(agentId, context);
    console.log(`[AGENT-BUS] Created context for agent ${agentId} with session ${context.sessionId}`);
    
    // Initialize conversation in backend with agent persona
    try {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        const backend = getLabRatsBackend();
        if (backend.available) {
          const agentPrompt = await this.promptManager.getPrompt(agentId);
          await backend.initializeConversation(this.conversationId, agentId, agentPrompt);
          console.log(`[AGENT-BUS] Initialized backend conversation for ${agentId}`);
        }
      }
    } catch (error) {
      console.error(`[AGENT-BUS] Error initializing backend conversation for ${agentId}:`, error);
    }
  }

  private async callAgentForDecision(agentId: string, prompt: string): Promise<{ success: boolean; content?: string }> {
    try {
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
      
      let chatModel;
      if (defaultConfig.providerId === 'openai') {
        chatModel = new ChatOpenAI({
          modelName: defaultConfig.modelId,
          temperature: 0.1,
          maxTokens: 50,
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
      
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(prompt)
      ];
      
      const response = await chatModel.invoke(messages);
      
      return {
        success: true,
        content: response.content.toString()
      };
      
    } catch (error) {
      console.error(`[AGENT-BUS] Error in decision call for ${agentId}:`, error);
      return {
        success: false
      };
    }
  }

  private async callAgentWithIsolatedSession(agentId: string, context: string, systemPrompt: string): Promise<{ success: boolean; message?: LangChainChatMessage; error?: string }> {
    try {
      const agentContext = this.agentContexts.get(agentId);
      if (!agentContext) {
        throw new Error(`No context found for agent ${agentId}`);
      }

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
      
      // Variable to capture token usage
      let tokenUsage: TokenUsage | undefined;
      
      let chatModel;
      if (defaultConfig.providerId === 'openai') {
        chatModel = new ChatOpenAI({
          modelName: defaultConfig.modelId,
          temperature: 0.7,
          maxTokens: 4096,
          openAIApiKey: apiKey,
          metadata: {
            agentId: agentId,
            sessionId: agentContext.sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          },
          callbacks: [{
            handleLLMEnd: (output: LLMResult) => {
              // Extract token usage from LLM output
              if (output.llmOutput?.tokenUsage) {
                tokenUsage = {
                  completionTokens: output.llmOutput.tokenUsage.completionTokens || 0,
                  promptTokens: output.llmOutput.tokenUsage.promptTokens || 0,
                  totalTokens: output.llmOutput.tokenUsage.totalTokens || 0
                };
                
                // Update session totals
                this.sessionTokenUsage.completionTokens += tokenUsage.completionTokens;
                this.sessionTokenUsage.promptTokens += tokenUsage.promptTokens;
                this.sessionTokenUsage.totalTokens += tokenUsage.totalTokens;
                
                // Update agent-specific token usage
                const agentContext = this.agentContexts.get(agentId);
                if (agentContext && agentContext.tokenUsage) {
                  agentContext.tokenUsage.completionTokens += tokenUsage.completionTokens;
                  agentContext.tokenUsage.promptTokens += tokenUsage.promptTokens;
                  agentContext.tokenUsage.totalTokens += tokenUsage.totalTokens;
                }
                
                console.log(`[AGENT-BUS-TOKEN] Agent ${agentId}: ${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion = ${tokenUsage.totalTokens} total`);
                console.log(`[AGENT-BUS-TOKEN] Bus session total: ${this.sessionTokenUsage.totalTokens} tokens`);
              }
            }
          }]
        });
      } else if (defaultConfig.providerId === 'anthropic') {
        chatModel = new ChatAnthropic({
          model: defaultConfig.modelId,
          temperature: 0.7,
          maxTokens: 4096,
          anthropicApiKey: apiKey,
          metadata: {
            agentId: agentId,
            sessionId: agentContext.sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          },
          callbacks: [{
            handleLLMEnd: (output: LLMResult) => {
              // Extract token usage from LLM output
              if (output.llmOutput?.tokenUsage) {
                tokenUsage = {
                  completionTokens: output.llmOutput.tokenUsage.completionTokens || 0,
                  promptTokens: output.llmOutput.tokenUsage.promptTokens || 0,
                  totalTokens: output.llmOutput.tokenUsage.totalTokens || 0
                };
                
                // Update session totals
                this.sessionTokenUsage.completionTokens += tokenUsage.completionTokens;
                this.sessionTokenUsage.promptTokens += tokenUsage.promptTokens;
                this.sessionTokenUsage.totalTokens += tokenUsage.totalTokens;
                
                // Update agent-specific token usage
                const agentContext = this.agentContexts.get(agentId);
                if (agentContext && agentContext.tokenUsage) {
                  agentContext.tokenUsage.completionTokens += tokenUsage.completionTokens;
                  agentContext.tokenUsage.promptTokens += tokenUsage.promptTokens;
                  agentContext.tokenUsage.totalTokens += tokenUsage.totalTokens;
                }
                
                console.log(`[AGENT-BUS-TOKEN] Agent ${agentId}: ${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion = ${tokenUsage.totalTokens} total`);
                console.log(`[AGENT-BUS-TOKEN] Bus session total: ${this.sessionTokenUsage.totalTokens} tokens`);
              }
            }
          }]
        });
      } else {
        throw new Error(`Unsupported provider: ${defaultConfig.providerId}`);
      }
      
      // Minimal enhanced prompt for agent context - the compact prompts already contain the logic
      const enhancedSystemPrompt = `${systemPrompt}\n\nSession ID: ${agentContext.sessionId}\n\nCurrent Action States: planning, open, waiting, implementing, needs_review, reviewing, done, user_input\nUse "involve" field to mention other agents when needed.`;
      
      // Log token usage visibility
      console.log(`[AGENT-BUS-PROMPT] Sending to agent ${agentId}:`);
      console.log(`[AGENT-BUS-PROMPT] System prompt length: ${enhancedSystemPrompt.length} chars`);
      console.log(`[AGENT-BUS-PROMPT] Context length: ${context.length} chars`);
      console.log(`[AGENT-BUS-PROMPT] Total estimated: ~${Math.ceil((enhancedSystemPrompt.length + context.length) / 4)} tokens`);
      
      // Optional: Log first 200 chars of each for debugging
      if (enhancedSystemPrompt.length > 1000) {
        console.log(`[AGENT-BUS-PROMPT] System prompt preview: ${enhancedSystemPrompt.substring(0, 200)}...`);
      }
      if (context.length > 500) {
        console.log(`[AGENT-BUS-PROMPT] Context preview: ${context.substring(0, 200)}...`);
      }
      
      // Create structured output model
      const structuredModel = chatModel.withStructuredOutput(agentResponseSchema as any, {
        name: "agent_response",
        method: defaultConfig.providerId === 'openai' ? 'json_mode' : 'function_calling'
      });
      
      const messages = [
        new SystemMessage(enhancedSystemPrompt),
        new HumanMessage(context)
      ];
      
      const response = await structuredModel.invoke(messages);
      
      // With withStructuredOutput, the response is already parsed
      const structuredResponse = response as AgentResponse;
      const messageContent = structuredResponse.message;
      
      const agentMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: messageContent,
        timestamp: new Date(),
        agentId: agentId,
        providerId: defaultConfig.providerId,
        modelId: defaultConfig.modelId,
        structuredResponse // Store the parsed structure
      };
      
      console.log(`[AGENT-BUS] Agent ${agentId} with session ${agentContext.sessionId} generated response`);
      
      return {
        success: true,
        message: agentMessage
      };
      
    } catch (error) {
      console.error(`[AGENT-BUS] Error in isolated session call for ${agentId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private detectLoop(agentId: string, content: string): boolean {
    const detection = this.loopDetection.get(agentId);
    const now = Date.now();
    
    // Clean content for comparison (remove whitespace variations)
    const cleanContent = content.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Special handling for Cortex - more aggressive loop detection
    if (agentId === 'cortex') {
      // Check for common repetitive patterns
      const loopPhrases = [
        'let\'s define',
        'to move forward',
        'to proceed',
        'let\'s set clear goals',
        'what do you think',
        'what specific',
        'consider outlining',
        'we need to outline',
        'please share'
      ];
      
      const hasLoopPhrase = loopPhrases.some(phrase => cleanContent.includes(phrase));
      
      if (detection && hasLoopPhrase) {
        // For Cortex, if we see similar phrases within 5 minutes, count it
        if ((now - detection.lastTimestamp) < 300000) { // 5 minutes
          detection.count++;
          detection.lastTimestamp = now;
          
          // After 2 similar messages, it's a loop for Cortex
          if (detection.count >= 2) {
            console.log(`[AGENT-BUS] Loop detected for Cortex - repeated pattern ${detection.count} times`);
            return true;
          }
        }
      }
    }
    
    if (detection) {
      // Check if content is similar to last message
      const similarity = this.calculateSimilarity(detection.lastContent, cleanContent);
      
      // Lower threshold for all agents (was 0.85, now 0.65)
      if (similarity > 0.65 && (now - detection.lastTimestamp) < 120000) {
        detection.count++;
        detection.lastTimestamp = now;
        
        // If repeated 3+ times, it's a loop
        if (detection.count >= 3) {
          console.log(`[AGENT-BUS] Loop detected for ${agentId} - repeated ${detection.count} times with ${Math.round(similarity * 100)}% similarity`);
          return true;
        }
      } else {
        // Reset if different content
        detection.lastContent = cleanContent;
        detection.count = 1;
        detection.lastTimestamp = now;
      }
    } else {
      // First time seeing this agent
      this.loopDetection.set(agentId, {
        lastContent: cleanContent,
        count: 1,
        lastTimestamp: now
      });
    }
    
    return false;
  }
  
  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity
    const set1 = new Set(str1.split(' '));
    const set2 = new Set(str2.split(' '));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
  
  private isGroupChat(): boolean {
    // Count unique agents who have participated (excluding user)
    const participatingAgents = new Set(
      this.globalMessageHistory
        .filter(msg => msg.author !== 'user')
        .map(msg => msg.author)
    );
    return participatingAgents.size > 1;
  }

  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      const agentId = match[1];
      // Handle user mention as "labrats" (from Account.tsx email: labrats@kobozo.com)
      if (agentId === 'labrats') {
        // Only add if not already in the list (deduplicate)
        if (!mentions.includes(agentId)) {
          mentions.push(agentId);
        }
      } else if (agents.find(a => a.id === agentId)) {
        // Only add if not already in the list (deduplicate)
        if (!mentions.includes(agentId)) {
          mentions.push(agentId);
        }
      }
    }
    
    return mentions;
  }

  private generateId(): string {
    return `bus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private resetStallDetection(): void {
    if (this.stallDetectionTimer) {
      clearTimeout(this.stallDetectionTimer);
      this.stallDetectionTimer = null;
    }
  }

  private startStallDetection(): void {
    if (!this.busActive) return;
    
    this.resetStallDetection();
    
    this.stallDetectionTimer = setTimeout(async () => {
      console.log('[AGENT-BUS] Conversation stall detected - nudging Cortex');
      await this.handleConversationStall();
    }, this.stallTimeoutMs);
  }

  private async analyzeGoalCompletion(): Promise<boolean> {
    if (this.globalMessageHistory.length === 0) return false;
    
    // Get the first user message (original goal)
    const originalUserMessage = this.globalMessageHistory.find(msg => msg.author === 'user');
    if (!originalUserMessage) return false;
    
    const originalGoal = originalUserMessage.content.toLowerCase();
    const recentMessages = this.globalMessageHistory.slice(-10); // Last 10 messages
    
    // CRITICAL: If this is an implementation task, check if code was actually delivered
    const isImplementation = await this.isImplementationTask();
    if (isImplementation) {
      // Look for code deliverables from development agents
      const developmentAgents = ['patchy', 'shiny'];
      const hasCodeDelivered = this.globalMessageHistory.some(msg => 
        developmentAgents.includes(msg.author) && 
        (msg.content.includes('```') || // Code blocks
         msg.content.includes('created') || // Created files
         msg.content.includes('implemented') || // Implementation messages
         msg.content.includes('file:') || // File references
         msg.action === 'done') // Developer marked task as done
      );
      
      if (!hasCodeDelivered) {
        console.log('[AGENT-BUS] Implementation task but no code delivered yet - goal NOT complete');
        return false;
      }
    }
    
    // Check for simple goal completion patterns
    
    // Pattern 1: Introduction requests - AGGRESSIVE DETECTION
    if (originalGoal.includes('introduce') || originalGoal.includes('introduction') || 
        originalGoal.includes('present') || originalGoal.includes('team') || 
        originalGoal.includes('invite') || originalGoal.includes('who')) {
      
      // Count how many agents have introduced themselves (check all messages, not just recent)
      const introductionMessages = this.globalMessageHistory.filter(msg => 
        msg.author !== 'user' && 
        msg.author !== 'system' &&
        (msg.content.toLowerCase().includes('i\'m ') || 
         msg.content.toLowerCase().includes('i am ') ||
         msg.content.toLowerCase().includes('my role') ||
         msg.content.toLowerCase().includes('my name is') ||
         msg.content.toLowerCase().includes('hello') && msg.content.toLowerCase().includes('i'))
      );
      
      // For team invitations, require MORE agents to respond and proper completion
      if (originalGoal.includes('invite')) {
        // Check how many agents were actually invited by looking at @mentions
        const invitationMessages = this.globalMessageHistory.filter(msg => 
          msg.content.includes('@') && 
          (msg.content.toLowerCase().includes('invite') || msg.author === 'cortex')
        );
        
        // Count unique @mentions in invitation messages
        const mentionedAgents = new Set<string>();
        invitationMessages.forEach(msg => {
          const mentions = msg.content.match(/@(\w+)/g) || [];
          mentions.forEach(mention => {
            const agentId = mention.slice(1);
            if (agentId !== 'labrats') { // Exclude user mentions
              mentionedAgents.add(agentId);
            }
          });
        });
        
        const invitedAgentCount = mentionedAgents.size;
        console.log(`[AGENT-BUS] ${invitedAgentCount} agents were invited, ${introductionMessages.length} have introduced themselves`);
        
        // Require at least 80% of invited agents to respond before considering completion
        if (invitedAgentCount > 0) {
          const responseRate = introductionMessages.length / invitedAgentCount;
          if (responseRate < 0.8) {
            console.log(`[AGENT-BUS] Only ${Math.round(responseRate * 100)}% of invited agents responded - goal NOT complete`);
            return false;
          }
        }
        
        // Also require a minimum number of responses for team invitations (at least 5 agents)
        if (introductionMessages.length < 5) {
          console.log(`[AGENT-BUS] Only ${introductionMessages.length} agents introduced themselves - waiting for more responses`);
          return false;
        }
        
        console.log(`[AGENT-BUS] Goal completion detected: ${introductionMessages.length} agents introduced themselves after team invitation`);
        return true;
      }
      
      // For other introduction requests, still require at least 3 agents
      if (introductionMessages.length >= 3) {
        console.log(`[AGENT-BUS] Goal completion detected: ${introductionMessages.length} agents introduced themselves`);
        return true;
      }
      
      // Also check if user asked about team and someone answered
      if (this.globalMessageHistory.some(msg => msg.content.toLowerCase().includes('team') && msg.content.length > 100)) {
        console.log('[AGENT-BUS] Goal completion detected: Team information provided');
        return true;
      }
      
      // If user asked to "invite" team but no other agents responded, it's NOT complete
      if (originalGoal.includes('invite') && introductionMessages.length < 3) {
        console.log('[AGENT-BUS] User asked to invite team but agents have not introduced themselves - goal NOT complete');
        return false;
      }
    }
    
    // Pattern 2: Simple questions that have been answered
    if (originalGoal.includes('?') && originalGoal.length < 100) {
      const hasRelevantAnswer = recentMessages.some(msg => 
        msg.author !== 'user' && 
        msg.author !== 'system' &&
        msg.content.length > 50 // Substantial response
      );
      
      if (hasRelevantAnswer) {
        console.log('[AGENT-BUS] Goal completion detected: Question appears to have been answered');
        return true;
      }
    }
    
    // Pattern 3: Requests for specific information
    const infoKeywords = ['what is', 'how do', 'can you tell', 'explain', 'describe'];
    if (infoKeywords.some(keyword => originalGoal.includes(keyword))) {
      const hasExplanation = recentMessages.some(msg => 
        msg.author !== 'user' && 
        msg.author !== 'system' &&
        msg.content.length > 100 // Detailed explanation
      );
      
      if (hasExplanation) {
        console.log('[AGENT-BUS] Goal completion detected: Information request fulfilled');
        return true;
      }
    }
    
    // Pattern 4: Check if agents are all just asking "what's next" repeatedly - VERY AGGRESSIVE
    const cortexMessages = recentMessages.filter(msg => msg.author === 'cortex');
    const recentCortexMessages = cortexMessages.slice(-5); // Look at last 5 Cortex messages
    
    // If Cortex has posted 2+ messages in recent history
    if (recentCortexMessages.length >= 2) {
      const askingNext = recentCortexMessages.filter(msg => 
        msg.content.toLowerCase().includes('next') ||
        msg.content.toLowerCase().includes('what would') ||
        msg.content.toLowerCase().includes('what should') ||
        msg.content.toLowerCase().includes('let\'s discuss') ||
        msg.content.toLowerCase().includes('focus area') ||
        msg.content.toLowerCase().includes('prioritize') ||
        msg.content.toLowerCase().includes('collaborate') ||
        msg.content.toLowerCase().includes('move forward')
      );
      
      // If more than half of recent Cortex messages are asking "what's next"
      if (askingNext.length >= Math.ceil(recentCortexMessages.length / 2)) {
        console.log('[AGENT-BUS] Goal completion detected: Cortex asking "what\'s next" repeatedly suggests goal is complete');
        return true;
      }
    }
    
    // Pattern 5: Check for conversation loops - same agent posting very similar messages
    if (recentCortexMessages.length >= 3) {
      const similarityThreshold = 0.7;
      let similarCount = 0;
      
      for (let i = 1; i < recentCortexMessages.length; i++) {
        const current = recentCortexMessages[i].content.toLowerCase();
        const previous = recentCortexMessages[i-1].content.toLowerCase();
        
        // Simple similarity check based on common words
        const currentWords = current.split(' ');
        const previousWords = previous.split(' ');
        const commonWords = currentWords.filter(word => previousWords.includes(word));
        const similarity = commonWords.length / Math.max(currentWords.length, previousWords.length);
        
        if (similarity > similarityThreshold) {
          similarCount++;
        }
      }
      
      if (similarCount >= 2) {
        console.log('[AGENT-BUS] Goal completion detected: Cortex posting very similar messages repeatedly');
        return true;
      }
    }
    
    return false;
  }

  private async isImplementationTask(): Promise<boolean> {
    if (this.globalMessageHistory.length === 0) return false;
    
    // Get the original user request
    const originalUserMessage = this.globalMessageHistory.find(msg => msg.author === 'user');
    if (!originalUserMessage) return false;
    
    const originalRequest = originalUserMessage.content.toLowerCase();
    
    // Check for implementation keywords in the original request
    const implementationKeywords = [
      'build', 'create', 'implement', 'develop', 'code', 'program', 'write',
      'make', 'app', 'application', 'system', 'feature', 'function', 'api',
      'website', 'tool', 'software', 'script', 'game', 'component'
    ];
    
    const hasImplementationKeywords = implementationKeywords.some(keyword => 
      originalRequest.includes(keyword)
    );
    
    if (hasImplementationKeywords) {
      console.log('[AGENT-BUS] Implementation keywords detected in original request');
      return true;
    }
    
    // Check for code blocks or implementation-related content in the conversation
    const hasCodeBlocks = this.globalMessageHistory.some(msg => 
      msg.content.includes('```') || 
      msg.content.includes('function') ||
      msg.content.includes('class ') ||
      msg.content.includes('import ') ||
      msg.content.includes('export ') ||
      msg.content.includes('const ') ||
      msg.content.includes('let ') ||
      msg.content.includes('var ')
    );
    
    if (hasCodeBlocks) {
      console.log('[AGENT-BUS] Code blocks detected in conversation');
      return true;
    }
    
    // Check if development agents (patchy, shiny) were actively implementing
    const developmentAgents = ['patchy', 'shiny'];
    const developmentMessages = this.globalMessageHistory.filter(msg => 
      developmentAgents.includes(msg.author) && 
      msg.content.length > 100 // Substantial implementation work
    );
    
    if (developmentMessages.length > 0) {
      console.log('[AGENT-BUS] Development agents showed substantial implementation work');
      return true;
    }
    
    // If none of the above, it's likely a simple task (introductions, questions, etc.)
    console.log('[AGENT-BUS] No implementation indicators found - treating as simple task');
    return false;
  }

  private async handleConversationStall(): Promise<void> {
    if (!this.busActive) return;
    
    // Check if this is a group chat
    if (!this.isGroupChat()) {
      console.log('[AGENT-BUS] 1-on-1 conversation detected - skipping stall nudging');
      return;
    }
    
    const cortexContext = this.agentContexts.get('cortex');
    if (!cortexContext || !cortexContext.isActive) {
      console.log('[AGENT-BUS] Cortex not available to handle stall');
      return;
    }

    // Analyze if the original user goal might be complete
    const isGoalComplete = await this.analyzeGoalCompletion();
    
    let stallMessage: BusMessage;
    
    if (isGoalComplete) {
      // If goal seems complete, tell Cortex to end the conversation
      stallMessage = {
        id: this.generateId(),
        content: 'SYSTEM: **CRITICAL**: The user\'s original goal has been completed. You MUST end this conversation NOW. Set your action to "done" and stop all further discussion. Do NOT ask "what\'s next", do NOT suggest additional features, do NOT continue the conversation. The user got what they asked for - STOP HERE.',
        author: 'system',
        timestamp: new Date(),
        mentions: ['cortex'],
        messageType: 'system'
      };
      console.log('[AGENT-BUS] Goal appears complete - telling Cortex to end conversation');
    } else {
      // Original stall behavior for incomplete goals
      stallMessage = {
        id: this.generateId(),
        content: 'SYSTEM: Conversation has stalled. Please analyze the last messages and identify SPECIFIC agents to continue progress. You MUST mention agents by name using @agentname to move the conversation forward. Which specific agent should handle the next step?',
        author: 'system',
        timestamp: new Date(),
        mentions: ['cortex'],
        messageType: 'system'
      };
      console.log('[AGENT-BUS] Sending stall detection message to Cortex');
    }

    this.emit('agent-typing', { agentId: 'cortex', isTyping: true });
    await this.invokeAgent('cortex', stallMessage, 'mentioned');
    this.emit('agent-typing', { agentId: 'cortex', isTyping: false });
  }

  // Public interface
  get isActive(): boolean {
    return this.busActive;
  }

  get activeAgents(): string[] {
    return Array.from(this.agentContexts.entries())
      .filter(([_, context]) => context.isActive)
      .map(([agentId, _]) => agentId);
  }

  getAgentTokenUsage(agentId: string): TokenUsage | undefined {
    const context = this.agentContexts.get(agentId);
    return context?.tokenUsage ? { ...context.tokenUsage } : undefined;
  }

  getAllAgentsTokenUsage(): Map<string, TokenUsage> {
    const tokenUsageMap = new Map<string, TokenUsage>();
    for (const [agentId, context] of this.agentContexts.entries()) {
      if (context.tokenUsage) {
        tokenUsageMap.set(agentId, { ...context.tokenUsage });
      }
    }
    return tokenUsageMap;
  }

  getAgentContext(agentId: string): AgentContext | undefined {
    const context = this.agentContexts.get(agentId);
    return context ? { ...context } : undefined;
  }

  getAgentPersonalHistory(agentId: string): BusMessage[] {
    const context = this.agentContexts.get(agentId);
    return context ? [...context.personalMessageHistory] : [];
  }

  getGlobalHistory(): BusMessage[] {
    return [...this.globalMessageHistory];
  }

  getAgentHistory(agentId: string): BusMessage[] {
    const context = this.agentContexts.get(agentId);
    return context ? [...context.personalMessageHistory] : [];
  }

  async sendUserMessage(content: string): Promise<void> {
    // Automatically resume if agents are paused
    if (!this.agentsActive) {
      console.log('[AGENT-BUS] User sent message while paused - automatically resuming');
      this.resume();
    }
    
    const userMessage: BusMessage = {
      id: this.generateId(),
      content,
      author: 'user',
      timestamp: new Date(),
      mentions: this.extractMentions(content),
      messageType: 'user'
    };

    await this.publishMessage(userMessage);
  }

  pause(): void {
    // Pause agents without clearing state
    this.agentsActive = false;
    console.log('[AGENT-BUS] Agents paused - message bus state preserved');
    
    // Emit bus pause event
    this.emit('bus-paused');
  }

  resume(): void {
    // Resume agents
    this.agentsActive = true;
    console.log('[AGENT-BUS] Agents resumed');
    
    // Emit bus resume event
    this.emit('bus-resumed');
  }

  reset(): void {
    this.busActive = false;
    this.agentsActive = true; // Reset to active when resetting completely
    this.globalMessageHistory = [];
    this.agentContexts.clear();
    this.resetStallDetection();
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    this.emit('bus-reset');
  }

  getSessionTokenUsage(): TokenUsage {
    return { ...this.sessionTokenUsage };
  }

  clearSessionTokenUsage(): void {
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
  }

  setCurrentProject(projectPath: string | null): void {
    // Pass through to langchain service if needed
    getLangChainChatService().setCurrentProject(projectPath);
  }

  private async checkAllAgentsDone(): Promise<void> {
    // DISABLED: Auto-QA invocation - QA agents should only be invoked when explicitly requested
    // This was causing unwanted Sniffy invocations for simple tasks like introductions
    
    // Get all active agents for debugging
    const activeAgents = Array.from(this.agentContexts.entries())
      .filter(([_, context]) => context.isActive)
      .map(([agentId, context]) => ({ agentId, context }));

    // Log current agent states for debugging
    const agentStates = activeAgents.map(({ agentId, context }) => `${agentId}:${context.currentAction}`);
    console.log(`[AGENT-BUS] Current agent states: ${agentStates.join(', ')}`);
  }

  // Debug methods
  debugBusState(): void {
    console.log('=== AGENT MESSAGE BUS DEBUG ===');
    console.log('Bus Active:', this.busActive);
    console.log('Global Message History:', this.globalMessageHistory.length, 'messages');
    console.log('Active Agents:', this.activeAgents);
    
    console.log('\n--- GLOBAL MESSAGES ---');
    this.globalMessageHistory.forEach((msg, i) => {
      console.log(`${i + 1}. [${msg.author}] ${msg.content.substring(0, 100)}...`);
    });
    
    console.log('\n--- AGENT CONTEXTS ---');
    for (const [agentId, context] of this.agentContexts.entries()) {
      console.log(`\n${agentId.toUpperCase()} Context:`);
      console.log(`  Session: ${context.sessionId}`);
      console.log(`  Active: ${context.isActive}`);
      console.log(`  Last Response: ${context.lastResponseTime}`);
      console.log(`  Current Action: ${context.currentAction}`);
      console.log(`  Personal History: ${context.personalMessageHistory.length} messages`);
      
      context.personalMessageHistory.forEach((msg, i) => {
        console.log(`    ${i + 1}. [${msg.author}] ${msg.content.substring(0, 80)}...`);
      });
    }
    console.log('================================');
  }

  private async processMcpToolCalls(content: string): Promise<string> {
    if (!this.mcpReady || typeof window === 'undefined' || !window.electronAPI?.mcp) {
      return content;
    }

    // Look for MCP tool calls in the format [[mcp:tool_name {args}]]
    const mcpPattern = /\[\[mcp:(\w+)\s*({[^}]+})\]\]/g;
    let processedContent = content;
    let match;

    while ((match = mcpPattern.exec(content)) !== null) {
      const toolName = match[1];
      const argsStr = match[2];
      
      try {
        const args = JSON.parse(argsStr);
        console.log(`[AGENT-BUS] Processing MCP tool call: ${toolName}`, args);
        
        const response = await window.electronAPI.mcp.callTool(toolName, args);
        
        if (response.success && response.result?.content && response.result.content.length > 0) {
          const toolResult = response.result.content[0].text || 'No result';
          
          // Replace the tool call with the result
          processedContent = processedContent.replace(
            match[0],
            `\n\n**Tool Result (${toolName}):**\n\`\`\`json\n${toolResult}\n\`\`\`\n`
          );
        } else if (!response.success) {
          throw new Error(response.error || 'Unknown error');
        }
      } catch (error) {
        console.error(`[AGENT-BUS] Error processing MCP tool ${toolName}:`, error);
        processedContent = processedContent.replace(
          match[0],
          `\n\n**Tool Error (${toolName}):** ${error instanceof Error ? error.message : 'Unknown error'}\n`
        );
      }
    }

    return processedContent;
  }
}

// Singleton instance
let agentMessageBusInstance: AgentMessageBus | null = null;

export function getAgentMessageBus(options?: MessageBusOptions): AgentMessageBus {
  if (!agentMessageBusInstance) {
    agentMessageBusInstance = new AgentMessageBus(options);
  }
  
  // Expose debug method to window for easy access
  if (typeof window !== 'undefined') {
    (window as any).debugBus = () => agentMessageBusInstance?.debugBusState();
  }
  
  return agentMessageBusInstance;
}