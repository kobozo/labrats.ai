import { BrowserEventEmitter } from './browser-event-emitter';
import { LangChainChatMessage } from './langchain-chat-service';
import { agents } from '../config/agents';

export interface OrchestratorMessage extends LangChainChatMessage {
  author: string;
  audience: string[];
}

export interface OrchestratorConfig {
  cooldownMs?: number;
  maxConsecutiveAgentTurns?: number;
  initialGoal?: string;
}

export class ChatOrchestrator extends BrowserEventEmitter {
  private members = new Set(['cortex']); // Start with Product Owner (Cortex)
  private phase: 'active' | 'completed' = 'active';
  private lastReply: Record<string, number> = {};
  private consecutiveAgentTurns = 0;
  private lastMessageAuthor: string | null = null;
  
  private readonly COOLDOWN_MS: number;
  private readonly MAX_CONSECUTIVE_TURNS: number;
  private readonly goal: string;

  constructor(config: OrchestratorConfig = {}) {
    super();
    this.COOLDOWN_MS = config.cooldownMs || 30000; // 30 seconds
    this.MAX_CONSECUTIVE_TURNS = config.maxConsecutiveAgentTurns || 5;
    this.goal = config.initialGoal || 'Complete the assigned task';
    
    // Auto-emit initial system message
    this.emit('system-message', this.createSystemMessage('Chat created with Product Owner (Cortex)'));
  }

  handle(msg: OrchestratorMessage): boolean {
    console.log(`[ORCHESTRATOR] Processing message from: ${msg.author}`);
    console.log(`[ORCHESTRATOR] Current phase: ${this.phase}`);
    console.log(`[ORCHESTRATOR] Current members: ${Array.from(this.members).join(', ')}`);
    
    if (this.phase === 'completed') {
      console.log(`[ORCHESTRATOR] Conversation is completed, ignoring message`);
      return false;
    }

    const author = msg.author;
    const isUser = author === 'user';
    const isProductOwner = author === 'cortex';
    const isAgent = !isUser && !isProductOwner;

    // Handle cooldown and consecutive turn tracking for agents
    if (isAgent) {
      console.log(`[ORCHESTRATOR] Agent ${author} attempting to respond`);
      if (!this.canAgentRespond(author)) {
        console.log(`[ORCHESTRATOR] Agent ${author} cannot respond (cooldown or not in room)`);
        return false;
      }
      console.log(`[ORCHESTRATOR] Agent ${author} allowed to respond`);
      this.updateAgentActivity(author);
      this.updateConsecutiveTurns(author);
    } else {
      // User or Product Owner broke the chain
      console.log(`[ORCHESTRATOR] ${author} broke the agent chain`);
      this.consecutiveAgentTurns = 0;
    }

    // Handle orchestrator commands from anyone (user, product owner, or any agent)
    if (msg.content.startsWith('@orchestrator')) {
      console.log(`[ORCHESTRATOR] Processing orchestrator command from ${author}: ${msg.content}`);
      return this.handleOrchestratorCommand(msg.content);
    }

    // Check if goal is reached
    if (this.isGoalReached(msg.content)) {
      this.endConversation();
      return true;
    }

    // Check for excessive agent chaining
    if (this.consecutiveAgentTurns > this.MAX_CONSECUTIVE_TURNS) {
      this.emit('system-message', this.createSystemMessage(
        '⚠️ Agents stuck in loop - @cortex please summarize progress or end conversation'
      ));
      this.consecutiveAgentTurns = 0;
      return false;
    }

    // Message is allowed to proceed
    this.lastMessageAuthor = author;
    return true;
  }

  private canAgentRespond(agentId: string): boolean {
    // Check if agent is in the room
    if (!this.members.has(agentId)) {
      return false;
    }

    // Check cooldown
    const now = Date.now();
    const lastReplyTime = this.lastReply[agentId] || 0;
    return (now - lastReplyTime) >= this.COOLDOWN_MS;
  }

  private updateAgentActivity(agentId: string): void {
    this.lastReply[agentId] = Date.now();
  }

  private updateConsecutiveTurns(agentId: string): void {
    if (this.lastMessageAuthor === 'user' || this.lastMessageAuthor === 'cortex') {
      this.consecutiveAgentTurns = 1;
    } else {
      this.consecutiveAgentTurns++;
    }
  }

  private handleOrchestratorCommand(content: string): boolean {
    const parts = content.trim().split(' ');
    const command = parts[1];
    const arg = parts[2];

    switch (command) {
      case 'invite':
        return this.inviteAgent(arg);
      case 'remove':
        return this.removeAgent(arg);
      case 'end':
        this.endConversation();
        return true;
      case 'status':
        this.showStatus();
        return true;
      default:
        this.emit('system-message', this.createSystemMessage(
          `Unknown orchestrator command: ${command}. Available: invite, remove, end, status`
        ));
        return false;
    }
  }

  private inviteAgent(agentId: string): boolean {
    console.log(`[ORCHESTRATOR] Attempting to invite agent: ${agentId}`);
    
    if (!agentId) {
      console.log(`[ORCHESTRATOR] Error: No agent ID provided for invite`);
      this.emit('system-message', this.createSystemMessage('Error: Agent ID required for invite'));
      return false;
    }

    // Check if agent exists
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      console.log(`[ORCHESTRATOR] Error: Agent '${agentId}' not found in agent list`);
      this.emit('system-message', this.createSystemMessage(`Error: Agent '${agentId}' not found`));
      return false;
    }

    // Check if already a member
    if (this.members.has(agentId)) {
      console.log(`[ORCHESTRATOR] Agent ${agentId} is already in the conversation`);
      this.emit('system-message', this.createSystemMessage(`${agent.name} is already in the conversation`));
      return false;
    }

    this.members.add(agentId);
    console.log(`[ORCHESTRATOR] ✅ Agent ${agentId} (${agent.name}) successfully invited`);
    console.log(`[ORCHESTRATOR] Updated members: ${Array.from(this.members).join(', ')}`);
    this.emit('system-message', this.createSystemMessage(`${agent.name} (${agent.title}) joined the conversation`));
    return true;
  }

  private removeAgent(agentId: string): boolean {
    if (!agentId) {
      this.emit('system-message', this.createSystemMessage('Error: Agent ID required for remove'));
      return false;
    }

    // Don't allow removing the Product Owner
    if (agentId === 'cortex') {
      this.emit('system-message', this.createSystemMessage('Error: Cannot remove Product Owner (Cortex)'));
      return false;
    }

    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      this.emit('system-message', this.createSystemMessage(`Error: Agent '${agentId}' not found`));
      return false;
    }

    if (!this.members.has(agentId)) {
      this.emit('system-message', this.createSystemMessage(`${agent.name} is not in the conversation`));
      return false;
    }

    this.members.delete(agentId);
    this.emit('system-message', this.createSystemMessage(`${agent.name} (${agent.title}) left the conversation`));
    return true;
  }

  private showStatus(): void {
    const memberList = Array.from(this.members).map(id => {
      const agent = agents.find(a => a.id === id);
      return agent ? `${agent.name} (${agent.title})` : id;
    }).join(', ');

    this.emit('system-message', this.createSystemMessage(
      `Conversation Status:\n` +
      `Phase: ${this.phase}\n` +
      `Goal: ${this.goal}\n` +
      `Members: ${memberList}\n` +
      `Consecutive agent turns: ${this.consecutiveAgentTurns}/${this.MAX_CONSECUTIVE_TURNS}`
    ));
  }

  private isGoalReached(content: string): boolean {
    // Look for explicit goal completion markers
    const goalPatterns = [
      /goal:\s*done/i,
      /task:\s*completed?/i,
      /objective:\s*achieved/i,
      /mission:\s*accomplished/i
    ];

    return goalPatterns.some(pattern => pattern.test(content));
  }

  private endConversation(): void {
    this.phase = 'completed';
    this.emit('system-message', this.createSystemMessage('Conversation completed'));
    this.emit('conversation-ended', {
      goal: this.goal,
      members: Array.from(this.members),
      endTime: new Date()
    });
  }

  private createSystemMessage(content: string): OrchestratorMessage {
    return {
      id: this.generateId(),
      role: 'system',
      content,
      timestamp: new Date(),
      author: 'system',
      audience: ['*']
    };
  }

  private generateId(): string {
    return `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public getters
  get isActive(): boolean {
    return this.phase === 'active';
  }

  get currentMembers(): string[] {
    return Array.from(this.members);
  }

  get currentGoal(): string {
    return this.goal;
  }

  isAgentInRoom(agentId: string): boolean {
    return this.members.has(agentId);
  }

  getAgentCooldownStatus(agentId: string): { canRespond: boolean; cooldownRemaining: number } {
    const now = Date.now();
    const lastReplyTime = this.lastReply[agentId] || 0;
    const cooldownRemaining = Math.max(0, this.COOLDOWN_MS - (now - lastReplyTime));
    
    return {
      canRespond: this.canAgentRespond(agentId),
      cooldownRemaining
    };
  }

  // Reset orchestrator state
  reset(newGoal?: string): void {
    this.members.clear();
    this.members.add('cortex'); // Always start with Product Owner
    this.phase = 'active';
    this.lastReply = {};
    this.consecutiveAgentTurns = 0;
    this.lastMessageAuthor = null;
    
    if (newGoal) {
      (this as any).goal = newGoal;
    }
    
    this.emit('system-message', this.createSystemMessage('Chat orchestrator reset'));
  }
}