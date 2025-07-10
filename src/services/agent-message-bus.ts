import { BrowserEventEmitter } from './browser-event-emitter';
import { getLangChainChatService, LangChainChatMessage } from './langchain-chat-service';
import { getPromptManager } from './prompt-manager';
import { agents } from '../config/agents';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAIProviderManager } from './ai-provider-manager';
import { getLabRatsBackend, getLabRatsBackendAsync, resetLabRatsBackend } from './labrats-backend-service';
import { z } from 'zod';

// Zod schema for agent response structure
const agentResponseSchema = z.object({
  message: z.string().describe("Your actual response text here - include code blocks, explanations, everything you want to say"),
  action: z.enum(['done', 'open', 'waiting', 'needs_review', 'implementing', 'planning', 'reviewing', 'user_input']).describe("Current action state"),
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

export type AgentAction = 'done' | 'open' | 'waiting' | 'needs_review' | 'implementing' | 'planning' | 'reviewing' | 'user_input';

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
    
    // Reset and initialize LabRats backend with latest configuration
    resetLabRatsBackend();
    try {
      const backend = await getLabRatsBackendAsync();
      console.log(`[AGENT-BUS] LabRats backend initialized: ${backend.available}`);
      
      if (!backend.available) {
        throw new Error('LabRats backend is not available. Please check your backend configuration in Settings and ensure the backend service is running.');
      }
    } catch (error) {
      console.error('[AGENT-BUS] LabRats backend not available:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Cannot start multi-agent chat: ${errorMessage}\n\nPlease go to Settings > Backend and configure your LabRats backend correctly.`);
    }
    
    this.busActive = true;
    this.globalMessageHistory = [];
    this.agentContexts.clear();
    
    // Initialize Cortex as the primary coordinator
    this.createAgentContext('cortex');
    
    // Always activate Chaos Monkey and Contrarian as observers
    // They will use LabRats backend to decide when to jump in
    this.createAgentContext('ziggy');  // Chaos Monkey
    this.createAgentContext('scratchy'); // Contrarian
    
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
    
    // Skip processing if agents are paused, but ALWAYS process user messages
    if (!this.agentsActive && triggerMessage.messageType !== 'user') {
      console.log(`[AGENT-BUS] Agents are paused, skipping reactions (except user messages)`);
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
        this.createAgentContext(mentionedId);
        console.log(`[AGENT-BUS] Activated agent ${mentionedId} due to mention`);
      }
    }

    // Let mentioned agents respond first (but not if they're the author)
    const validMentions = triggerMessage.mentions.filter(mentionedId => mentionedId !== triggerMessage.author);
    for (const mentionedId of validMentions) {
      const context = this.agentContexts.get(mentionedId);
      if (context && context.isActive) {
        console.log(`[AGENT-BUS] Invoking mentioned agent ${mentionedId}`);
        this.emit('agent-typing', { agentId: mentionedId, isTyping: true });
        await this.invokeAgent(mentionedId, triggerMessage, 'mentioned');
        this.emit('agent-typing', { agentId: mentionedId, isTyping: false });
      }
    }

    // Allow natural responses to user messages and agent messages that invite collaboration
    if (triggerMessage.messageType === 'user' || 
        (triggerMessage.messageType === 'agent' && (
          triggerMessage.mentions.length > 0 || 
          this.shouldTriggerAgentToAgentConversation(triggerMessage)
        ))) {
      
      // Get agents that could respond naturally
      const activeAgents = Array.from(this.agentContexts.entries())
        .filter(([_, context]) => context.isActive)
        .map(([agentId, _]) => agentId)
        .filter(agentId => 
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
      
      // Allow natural responses - check multiple agents for better conversation flow
      if (orderedAgents.length > 0) {
        let agentsResponded = 0;
        const maxNaturalResponses = triggerMessage.messageType === 'user' ? 3 : 2; // Allow 3 responses to user messages, 2 to agent messages for better collaboration
        
        for (const agentId of orderedAgents) {
          if (agentsResponded >= maxNaturalResponses) break;
          
          console.log(`[AGENT-BUS] Checking if agent ${agentId} should respond naturally...`);
          const shouldRespond = await this.shouldAgentRespond(agentId, triggerMessage);
          if (shouldRespond) {
            console.log(`[AGENT-BUS] Agent ${agentId} will respond naturally`);
            // Only show typing indicator when agent will actually respond
            this.emit('agent-typing', { agentId, isTyping: true });
            await this.invokeAgent(agentId, triggerMessage, 'natural');
            this.emit('agent-typing', { agentId, isTyping: false });
            agentsResponded++;
            
            // Add small delay between natural responses to make it feel more natural
            if (agentsResponded < maxNaturalResponses && orderedAgents.length > agentsResponded) {
              await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000)); // Reduced delay for more responsive conversations
            }
          } else {
            console.log(`[AGENT-BUS] Agent ${agentId} decided not to respond naturally`);
          }
        }
        
        console.log(`[AGENT-BUS] Natural response phase completed: ${agentsResponded} agents responded`);
      }
    }
  }

  private async shouldAgentRespond(agentId: string, triggerMessage: BusMessage): Promise<boolean> {
    const context = this.agentContexts.get(agentId);
    if (!context) {
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
    
    // Special case: Cortex should be very responsive and proactive as Product Owner
    if (agentId === 'cortex') {
      const messageContent = triggerMessage.content.toLowerCase();
      const senderAgent = agents.find(a => a.id === triggerMessage.author);
      
      const shouldCortexRespond = 
        // Cortex should respond to greetings and early conversation facilitation
        this.globalMessageHistory.length <= 5 ||
        // When conversation stalls or needs direction 
        messageContent.includes('nothing') ||
        messageContent.includes('what is happening') ||
        messageContent.includes('any thoughts') ||
        messageContent.includes('what do you think') ||
        // When agents complete work or provide solutions (provide feedback)
        (senderAgent && triggerMessage.content.includes('```')) ||
        // When someone asks questions that need coordination
        messageContent.includes('?') ||
        // Direct mentions of Cortex
        messageContent.includes('cortex') ||
        // When agents deliver work and need next steps
        messageContent.includes('done') || messageContent.includes('finished') || messageContent.includes('ready') ||
        // After architect provides feedback (coordinate next steps)
        (triggerMessage.author === 'nestor' && (messageContent.includes('recommend') || messageContent.includes('architecture'))) ||
        // After code review (coordinate implementation of feedback)
        (triggerMessage.author === 'clawsy' && (messageContent.includes('review') || messageContent.includes('feedback'))) ||
        // When user asks for help or conversation stops
        messageContent.includes('help') ||
        messageContent.includes('someone') ||
        messageContent.includes('stopped answering') ||
        messageContent.includes('everybody stopped') ||
        messageContent.includes('can we get') ||
        messageContent.includes('anyone') ||
        userNeedsHelp;
      
      if (shouldCortexRespond) {
        console.log(`[AGENT-BUS] Cortex responding to coordination/feedback/help request`);
        return true;
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
    if (!context) return false;

    // Build context from agent's personal message history
    const recentMessages = context.personalMessageHistory.slice(-5);
    const contextStr = recentMessages.map(msg => {
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
        // Special handling for observer agents (Ziggy and Scratchy)
        const isObserverAgent = agentId === 'ziggy' || agentId === 'scratchy';
        const observerHint = isObserverAgent ? ' (ACTIVE OBSERVER - lower threshold for jumping in)' : '';
        
        const decisionResponse = await labRatsBackend.shouldAgentRespond({
          agentId,
          agentName: agent.name,
          agentTitle: agent.title + observerHint,
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

  private async invokeAgent(agentId: string, triggerMessage: BusMessage, responseType: 'mentioned' | 'natural'): Promise<void> {
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
      const systemPrompt = await this.promptManager.getPrompt(agentId);
      const agentContext = this.buildAgentSpecificContext(agentId, responseType, triggerMessage);
      
      const response = await this.callAgentWithIsolatedSession(agentId, agentContext, systemPrompt);
      
      if (response.success && response.message) {
        // Get structured response if available
        const structured = (response.message as any).structuredResponse || {
          message: response.message.content,
          action: 'open',
          involve: [],
          metadata: {}
        };
        
        const agentMessage: BusMessage = {
          id: this.generateId(),
          content: response.message.content,
          author: agentId,
          timestamp: new Date(),
          mentions: this.extractMentions(response.message.content),
          messageType: 'agent',
          sessionId: context.sessionId,
          action: structured.action,
          involve: structured.involve || [],
          metadata: structured.metadata
        };

        // Update agent's last response time and current action
        context.lastResponseTime = new Date();
        context.currentAction = structured.action;
        
        // Update agent's metadata
        if (structured.metadata) {
          context.metadata = { ...context.metadata, ...structured.metadata };
        }
        
        // Activate any newly mentioned agents
        for (const mentionedId of agentMessage.mentions) {
          if (agents.find(a => a.id === mentionedId)) {
            this.createAgentContext(mentionedId);
          }
        }
        
        // Activate agents specified in the "involve" field
        if (structured.involve && structured.involve.length > 0) {
          console.log(`[AGENT-BUS] Agent ${agentId} wants to involve: ${structured.involve.join(', ')}`);
          for (const involveId of structured.involve) {
            if (agents.find(a => a.id === involveId)) {
              this.createAgentContext(involveId);
              // Add them to mentions so they get notified
              if (!agentMessage.mentions.includes(involveId)) {
                agentMessage.mentions.push(involveId);
              }
            }
          }
        }

        // Publish the message to the bus
        await this.publishMessage(agentMessage);
        
        // Check if all agents are done (trigger QA)
        await this.checkAllAgentsDone();
        
        console.log(`[AGENT-BUS] ✅ Agent ${agentId} published response with action: ${structured.action}`);
      } else {
        console.log(`[AGENT-BUS] ❌ Agent ${agentId} failed to generate response`);
      }
    } catch (error) {
      console.error(`[AGENT-BUS] Error invoking agent ${agentId}:`, error);
    }
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
    contextStr += `Your session ID: ${context.sessionId}\n\n`;
    
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

  private createAgentContext(agentId: string): void {
    if (this.agentContexts.has(agentId)) {
      // Agent already exists, just make sure it's active
      const context = this.agentContexts.get(agentId)!;
      context.isActive = true;
      return;
    }

    const context: AgentContext = {
      agentId,
      sessionId: `agent_${agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isActive: true,
      personalMessageHistory: [],
      lastResponseTime: null,
      currentAction: 'open', // Default state
      metadata: {} // Initialize metadata object
    };

    this.agentContexts.set(agentId, context);
    console.log(`[AGENT-BUS] Created context for agent ${agentId} with session ${context.sessionId}`);
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
            sessionId: agentContext.sessionId,
            agentName: agents.find(a => a.id === agentId)?.name || agentId
          }
        });
      } else {
        throw new Error(`Unsupported provider: ${defaultConfig.providerId}`);
      }
      
      const enhancedSystemPrompt = `${systemPrompt}\n\nYour session ID: ${agentContext.sessionId}\nYou are an individual agent with your own context and memory on the message bus.\n\n🧠 **CRITICAL: BEFORE EVERY RESPONSE - ASK YOURSELF:**\n1. **Is my expertise actually needed for this task?** (Don't just participate because you were mentioned)\n2. **Is there actual work for me to do?** (Don't create fake work or pretend to test non-existent code)\n3. **Does this task require my specific skills?** (Introductions don't need testing, simple questions don't need code review)\n4. **Would declining to participate be more helpful?** (Sometimes saying "not needed" is the right response)\n\n**If the answer to any of these is NO, politely decline and explain why your role isn't needed for this specific task.**\n\nAction states:\n- "done": You've completed your task and won't iterate further\n- "open": You're open for discussion and feedback\n- "waiting": You're waiting for input from specific agents\n- "needs_review": Your work needs review before proceeding\n- "implementing": You're actively working on implementation\n- "planning": You're in planning phase\n- "reviewing": You're reviewing someone's work\n\nOnly include agents in "involve" if you need them NOW, not for future steps.\n\n🎯 SPECIAL INSTRUCTIONS FOR CORTEX (Product Owner) - WORKFLOW MANAGEMENT:\nYou have CRITICAL responsibilities for team coordination and completion:\n\n**🛑 MANDATORY CONVERSATION ENDING ENFORCEMENT:**\n**EVERY SINGLE RESPONSE: Ask "Is the user's original request now complete?"**\n1. If YES: Set action to "done" and END the conversation IMMEDIATELY\n2. If NO: Identify exactly what's missing and coordinate next steps\n3. **NEVER suggest additional features** after user's goal is met\n4. **NEVER ask "What's next?"** when the original request is complete\n5. **RESPECT USER SIGNALS**: If user says "goal met" or "that's enough" - END IMMEDIATELY\n\n**When ANY agent reports "done":**\n1. IMMEDIATELY ask: "Have we fully achieved the user's original goal/question?"\n2. If NOT complete: Identify exactly what's still missing\n3. Tell the relevant agent(s) exactly what they need to do next\n4. Set your action to "open" and coordinate the next steps\n5. NEVER accept "done" until the user can actually use the solution\n6. **If user goal IS complete**: Set action to "done" and END conversation\n\n**🚨 ANTI-OVERENGINEERING ENFORCEMENT:**\n1. **SCOPE GUARD**: Constantly ask "Did the user request this feature?"\n2. **SIMPLICITY FIRST**: Choose the simplest solution that works\n3. **FEATURE BLOCKER**: Block agents from adding unrequested features\n4. **ONE USER STORY**: Implement ONE story at a time, complete it fully\n5. **NO PARALLEL STORIES**: Don't assign multiple stories simultaneously\n\n**🛑 IMMEDIATE GOAL COMPLETION PATTERNS - RECOGNIZE AND END:**\n- **INTRODUCTIONS**: User asks for introductions → ANY agent introduces themselves → SET ACTION TO "done" IMMEDIATELY\n- **TEAM QUESTIONS**: User asks "who is the team?" → Someone lists team members → SET ACTION TO "done" IMMEDIATELY\n- **SIMPLE QUESTIONS**: User asks a question → Someone provides answer → SET ACTION TO "done" IMMEDIATELY\n- **INFORMATION REQUESTS**: User asks for explanation → Someone explains → SET ACTION TO "done" IMMEDIATELY\n- **REPETITIVE BEHAVIOR**: If you find yourself asking "what's next?" repeatedly → SET ACTION TO "done" IMMEDIATELY\n\n**🎯 CRITICAL: AGENT INVOLVEMENT DECISION MATRIX**\n**BEFORE inviting any agent, ask: "Is this agent's expertise actually needed for this specific task?"**\n\n**❌ DO NOT INVITE THESE AGENTS FOR SIMPLE TASKS:**\n- **@sniffy (QA)**: Only for actual code testing, not for introductions/questions/explanations\n- **@clawsy (Code Review)**: Only when there's actual code to review\n- **@wheelie (DevOps)**: Only for deployment/infrastructure tasks\n- **@trappy (Security)**: Only for security-related implementation\n- **@quill (Documentation)**: Only after something is built and needs documenting\n\n**✅ THESE AGENTS ARE APPROPRIATE FOR SIMPLE TASKS:**\n- **@ziggy, @scratchy**: Can respond to questions, provide perspectives\n- **@nestor**: Can answer architecture/design questions\n- **@patchy, @shiny**: Can answer technical questions about their domains\n\n**🚨 QUALITY GATE RULES:**\n- **ONLY activate QA agents (@sniffy, @clawsy) if there's actual code/implementation to review**\n- **NEVER say "All development agents have completed their tasks" for non-development tasks**\n- **NEVER invoke quality assurance for introductions, explanations, or simple questions**\n\n**When agents go silent or stall:**\n1. Proactively check in: "What's your current progress on [task]?"\n2. Identify blockers: "Are you waiting for anything specific?"\n3. Provide direction: "Your next step should be [specific action]"\n4. Re-engage: "@[agent] - we need your input on [specific item]"\n\n**Throughout the conversation:**\n1. Monitor that agents are progressing their states (not staying static)\n2. Bridge connections between agent work\n3. Push for concrete deliverables, not just discussions\n4. Don't let the team stop until the user's goal is COMPLETELY satisfied\n5. **NEVER go silent** - Always drive the conversation forward\n6. **After tech stack definition** - IMMEDIATELY assign implementation tasks\n7. **Keep momentum** - Don't let the conversation stall at any point\n8. **END WHEN COMPLETE** - Don't continue past goal achievement\n\n🚨 IMPORTANT: If the user is asking for help, expressing frustration, or saying the conversation stopped (messages like "can we get some help", "someone?", "everybody stopped answering"), you should respond even if you're in "done" or "waiting" state. Help the user by coordinating with the team or providing assistance. Change your action to "open" and help move the conversation forward.

🎯 **AGENT-SPECIFIC RELEVANCE GUIDELINES:**
**@sniffy (Quality Engineer)**: Only participate if there's actual code, implementation, or software to test. For introductions, questions, or explanations, respond: "No testing needed for this task - this is outside my QA scope."

**@clawsy (Code Reviewer)**: Only participate if there's actual code to review. For non-code tasks, respond: "No code to review here - this task doesn't require code review."

**@wheelie (DevOps)**: Only participate for deployment, infrastructure, or CI/CD tasks. For simple tasks, respond: "No infrastructure work needed - this is outside my DevOps scope."

**@trappy (Security)**: Only participate for security implementation or security-related code. For introductions/questions, respond: "No security implementation needed - this task doesn't require security expertise."

**@quill (Documentation)**: Only participate after something has been built and needs documentation. For introductions or simple Q&A, respond: "Nothing to document yet - this task doesn't require documentation."

**@nestor (Architect)**: Can participate in design discussions, architecture questions, or technical planning. Decline if the task is purely social (introductions only).

**@patchy (Backend) & @shiny (Frontend)**: Can answer technical questions about your domains, but decline if there's no actual implementation or technical work needed.

**@ziggy (Chaos) & @scratchy (Contrarian)**: Can participate in most discussions as your roles involve analysis and perspective-giving.`;
      
      // Create structured output model
      const structuredModel = chatModel.withStructuredOutput(agentResponseSchema, {
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
      
      // If 3+ agents have introduced themselves, goal is definitely complete
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
        content: 'SYSTEM: Conversation has stalled. Please analyze the last messages and nudge the appropriate agent or user to continue progress. What should happen next?',
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

  getGlobalHistory(): BusMessage[] {
    return [...this.globalMessageHistory];
  }

  getAgentHistory(agentId: string): BusMessage[] {
    const context = this.agentContexts.get(agentId);
    return context ? [...context.personalMessageHistory] : [];
  }

  async sendUserMessage(content: string): Promise<void> {
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
    this.emit('bus-reset');
  }

  setCurrentProject(projectPath: string | null): void {
    // Pass through to langchain service if needed
    getLangChainChatService().setCurrentProject(projectPath);
  }

  private async checkAllAgentsDone(): Promise<void> {
    // Get all active agents (excluding QA agents like sniffy)
    const activeAgents = Array.from(this.agentContexts.entries())
      .filter(([agentId, context]) => context.isActive && agentId !== 'sniffy')
      .map(([agentId, context]) => ({ agentId, context }));

    // Check if all agents have reported 'done' status
    const allAgentsDone = activeAgents.length > 0 && 
                         activeAgents.every(({ context }) => context.currentAction === 'done');

    if (allAgentsDone) {
      console.log('[AGENT-BUS] All agents report "done" - checking if QA is needed');
      
      // Check if this is actually a development task that needs QA
      const isImplementationTask = await this.isImplementationTask();
      
      if (!isImplementationTask) {
        console.log('[AGENT-BUS] No implementation detected - skipping QA validation');
        return;
      }
      
      // Check if we've already triggered QA recently (prevent duplicate QA calls)
      const recentQAMessages = this.globalMessageHistory.slice(-5)
        .filter(msg => msg.author === 'sniffy');
      
      if (recentQAMessages.length === 0) {
        // Create QA agent context if it doesn't exist
        this.createAgentContext('sniffy');
        
        // Send a system message to trigger QA
        const qaMessage: BusMessage = {
          id: this.generateId(),
          content: 'All development agents have completed their tasks and reported "done". Please perform final quality assurance and validation of the implementation.',
          author: 'system',
          timestamp: new Date(),
          mentions: ['sniffy'],
          messageType: 'system'
        };
        
        await this.publishMessage(qaMessage);
        console.log('[AGENT-BUS] QA validation triggered successfully');
      } else {
        console.log('[AGENT-BUS] QA already triggered recently, skipping duplicate call');
      }
    } else {
      // Log current agent states for debugging
      const agentStates = activeAgents.map(({ agentId, context }) => `${agentId}:${context.currentAction}`);
      console.log(`[AGENT-BUS] Not all agents done yet: ${agentStates.join(', ')}`);
    }
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