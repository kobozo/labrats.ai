import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Crown, 
  AlertTriangle, 
  Zap, 
  Code, 
  Database, 
  Palette,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Users,
  Brain,
  Settings,
  Target,
  Search,
  Shield,
  Server,
  Edit,
  Building,
  FileText,
  Copy,
  Check,
  Pause,
  Play,
  MoreVertical,
  Archive,
  Trash2,
  Download,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getLangChainChatService, TokenUsage } from '../../services/langchain-chat-service';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { getPromptManager } from '../../services/prompt-manager';
import { agents as configAgents, Agent as ConfigAgent } from '../../config/agents';
import { stateManager } from '../../services/state-manager';
import { getChatService, ChatServiceMessage } from '../../services/chat-service';
import { getAgentMessageBus, BusMessage } from '../../services/agent-message-bus';
import { chatHistoryManager } from '../../services/chat-history-manager-renderer';
import { MentionAutocomplete } from './MentionAutocomplete';
import { getLabRatsBackend } from '../../services/labrats-backend-service';
import { RichTextInput, RichTextInputRef } from './RichTextInput';

interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  icon: React.ComponentType<any>;
  isActive: boolean;
  specialization: string[];
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | Agent;
  timestamp: Date;
  type?: 'text' | 'code' | 'review' | 'approval';
  metadata?: {
    codeChanges?: number;
    filesAffected?: string[];
    reviewStatus?: 'pending' | 'approved' | 'rejected';
  };
  providerId?: string;
  modelId?: string;
  isStreaming?: boolean;
}

interface ChatProps {
  onCodeReview: (changes: any) => void;
  currentFolder?: string | null;
  onTokenUsageChange?: (usage: TokenUsage) => void;
}

// Map config agents to Chat component format
const getDisplayAgents = (): Agent[] => {
  return configAgents.map(agent => ({
    id: agent.id,
    name: agent.name,
    role: agent.title,
    color: 'dynamic', // We'll use getAgentColorHex instead
    icon: Target, // Fallback icon, we'll use avatar images instead
    isActive: agent.id === 'cortex', // Only Cortex is active by default
    specialization: [] // Not used in current implementation
  }));
};

const agents = getDisplayAgents();

// Switchy agent for single-agent mode (when backend unavailable)
const switchyAgent: Agent = {
  id: 'switchy',
  name: 'Switchy',
  role: 'Full-Stack AI Assistant',
  color: 'dynamic',
  icon: Target,
  isActive: true,
  specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
};

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Function to safely render markdown
const renderMarkdown = (content: string): string => {
  const rawMarkup = marked.parse(content);
  return DOMPurify.sanitize(rawMarkup as string);
};

export const Chat: React.FC<ChatProps> = ({ onCodeReview, currentFolder, onTokenUsageChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeAgents, setActiveAgents] = useState(agents.filter(a => a.isActive));
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [agentColorOverrides, setAgentColorOverrides] = useState<{ [key: string]: string }>({});
  const [isBusActive, setIsBusActive] = useState(false);
  const [agentsPaused, setAgentsPaused] = useState(false);
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedChat, setCopiedChat] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [sessionTokenUsage, setSessionTokenUsage] = useState<TokenUsage>({ completionTokens: 0, promptTokens: 0, totalTokens: 0 });
  const [showBackendWarning, setShowBackendWarning] = useState(false);
  const [backendCheckInProgress, setBackendCheckInProgress] = useState(false);
  const [singleAgentMode, setSingleAgentMode] = useState(false);
  const [showAgentsDropdown, setShowAgentsDropdown] = useState(false);
  const [chatTitle, setChatTitle] = useState('Agent Chat');
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [agentTokenUsage, setAgentTokenUsage] = useState<Map<string, TokenUsage>>(new Map());
  const [povMode, setPovMode] = useState<{ enabled: boolean; agentId: string | null }>({ enabled: false, agentId: null });
  const [showAgentMenu, setShowAgentMenu] = useState<string | null>(null);
  const [lastSystemPrompt, setLastSystemPrompt] = useState<string>('');
  const [lastRawInput, setLastRawInput] = useState<string>('');
  const [lastRawOutput, setLastRawOutput] = useState<string>('');
  const [rawCommunicationFlow, setRawCommunicationFlow] = useState<Array<{
    id: string;
    type: 'system' | 'input' | 'output';
    content: string;
    timestamp: Date;
  }>>([]);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const agentsDropdownRef = useRef<HTMLDivElement>(null);
  const agentMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<RichTextInputRef>(null);
  const chatService = getLangChainChatService();
  const providerManager = getAIProviderManager();
  const baseChatService = getChatService();
  const messageBus = getAgentMessageBus({
    maxContextMessages: 10,
    maxAgentHistory: 20
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Initialize AI providers with error handling
    console.log('Chat component mounted, initializing AI...');
    initializeAI();
    loadAgentColorOverrides();
    
    // Check LabRats backend availability
    checkBackendAvailability();

    // Listen for config changes to reload color overrides
    const handleConfigChange = () => {
      loadAgentColorOverrides();
    };
    
    // Set up periodic check for config changes (simple solution)
    const interval = setInterval(loadAgentColorOverrides, 1000);
    
    // Set up message bus event listeners
    const handleBusMessage = (message: BusMessage) => {
      // Skip user messages since they're already added directly in handleSend
      if (message.author === 'user') {
        // Still update active agents list for user messages
        const activeAgentIds = messageBus.activeAgents;
        setActiveAgents(agents.filter(a => activeAgentIds.includes(a.id)));
        
        // Update agent token usage
        const tokenUsage = messageBus.getAllAgentsTokenUsage();
        setAgentTokenUsage(tokenUsage);
        return;
      }
      
      const convertedMessage: Message = {
        id: message.id,
        content: message.content,
        sender: message.author === 'user' ? 'user' : agents.find(a => a.id === message.author) || agents[0],
        timestamp: message.timestamp,
        type: message.messageType === 'system' ? 'text' : 'text'
      };
      
      setMessages(prev => [...prev, convertedMessage]);
      
      // Update active agents list
      const activeAgentIds = messageBus.activeAgents;
      setActiveAgents(agents.filter(a => activeAgentIds.includes(a.id)));
      
      // Update agent token usage
      const tokenUsage = messageBus.getAllAgentsTokenUsage();
      setAgentTokenUsage(tokenUsage);
    };

    const handleBusReset = () => {
      setIsBusActive(false);
      setAgentsPaused(false);
      setTypingAgents(new Set());
    };

    const handleBusPaused = () => {
      setAgentsPaused(true);
      setTypingAgents(new Set());
    };

    const handleBusResumed = () => {
      setAgentsPaused(false);
    };

    const handleAgentTyping = ({ agentId, isTyping }: { agentId: string; isTyping: boolean }) => {
      setTypingAgents(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(agentId);
        } else {
          newSet.delete(agentId);
        }
        return newSet;
      });
    };

    messageBus.on('message', handleBusMessage);
    messageBus.on('bus-reset', handleBusReset);
    messageBus.on('bus-paused', handleBusPaused);
    messageBus.on('bus-resumed', handleBusResumed);
    messageBus.on('agent-typing', handleAgentTyping);
    
    // Periodic sync to ensure UI state matches bus state
    const syncInterval = setInterval(() => {
      const actualBusState = messageBus.isActive;
      setIsBusActive(actualBusState);
      
      // Aggregate token usage from both chat service (single-agent) and message bus (multi-agent)
      const chatServiceTokens = chatService.getSessionTokenUsage();
      const messageBusTokens = messageBus.getSessionTokenUsage();
      
      const aggregatedTokenUsage: TokenUsage = {
        completionTokens: chatServiceTokens.completionTokens + messageBusTokens.completionTokens,
        promptTokens: chatServiceTokens.promptTokens + messageBusTokens.promptTokens,
        totalTokens: chatServiceTokens.totalTokens + messageBusTokens.totalTokens
      };
      
      setSessionTokenUsage(aggregatedTokenUsage);
      onTokenUsageChange?.(aggregatedTokenUsage);
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
      messageBus.off('message', handleBusMessage);
      messageBus.off('bus-reset', handleBusReset);
      messageBus.off('bus-paused', handleBusPaused);
      messageBus.off('bus-resumed', handleBusResumed);
      messageBus.off('agent-typing', handleAgentTyping);
    };
  }, []);

  // Load persisted messages when component mounts or folder changes
  useEffect(() => {
    const loadPersistedMessages = async () => {
      if (currentFolder) {
        // Set current project in chat services
        await chatService.setCurrentProject(currentFolder);
        messageBus.setCurrentProject(currentFolder);
        
        // Load messages from chat history manager
        const persistedMessages = await chatHistoryManager.loadChatHistory(currentFolder);
        if (persistedMessages.length > 0) {
          // Convert ChatServiceMessage to Message format
          const convertedMessages: Message[] = persistedMessages.map(msg => ({
            id: msg.id,
            content: msg.content,
            sender: msg.role === 'user' ? 'user' : agents.find(a => a.id === msg.agentId) || agents[0],
            timestamp: new Date(msg.timestamp),
            type: 'text' as const,
            providerId: msg.providerId,
            modelId: msg.modelId
          }));
          setMessages(convertedMessages);
          
          // Also load conversation history into chat service
          await baseChatService.clearConversation();
          persistedMessages.forEach(msg => {
            (baseChatService as any).conversationHistory.push(msg);
          });
        }
      } else {
        // Clear messages when no folder is open
        setMessages([]);
        await baseChatService.clearConversation();
        await chatService.setCurrentProject(null);
        messageBus.setCurrentProject(null);
        chatService.clearSessionTokenUsage();
        messageBus.clearSessionTokenUsage();
        const resetUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
        setSessionTokenUsage(resetUsage);
        onTokenUsageChange?.(resetUsage);
      }
    };
    
    loadPersistedMessages();
  }, [currentFolder]);

  // Handle escape key for modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showBackendWarning) {
        setShowBackendWarning(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showBackendWarning]);

  // Persist messages whenever they change
  useEffect(() => {
    if (currentFolder && messages.length > 0) {
      // Convert Message format to ChatServiceMessage
      const chatServiceMessages: ChatServiceMessage[] = messages.map(msg => ({
        id: msg.id,
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        agentId: msg.sender !== 'user' ? (msg.sender as Agent).id : undefined,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
      
      // Save chat history to .labrats/chats/history
      chatHistoryManager.saveChatHistory(currentFolder, chatServiceMessages);
    }
  }, [messages, currentFolder]);

  // Handle clicking outside of chat menu and agents dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
      if (agentsDropdownRef.current && !agentsDropdownRef.current.contains(event.target as Node)) {
        setShowAgentsDropdown(false);
      }
      // Check all agent menu refs
      let clickedInsideAgentMenu = false;
      agentMenuRefs.current.forEach((ref) => {
        if (ref && ref.contains(event.target as Node)) {
          clickedInsideAgentMenu = true;
        }
      });
      if (!clickedInsideAgentMenu) {
        setShowAgentMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadAgentColorOverrides = async () => {
    try {
      if (window.electronAPI?.config?.get) {
        const stored = await window.electronAPI.config.get('agents', 'overrides');
        if (stored && typeof stored === 'object') {
          const colorOverrides: { [key: string]: string } = {};
          Object.entries(stored).forEach(([agentId, config]: [string, any]) => {
            if (config.colorAccent) {
              colorOverrides[agentId] = config.colorAccent;
            }
          });
          setAgentColorOverrides(colorOverrides);
        }
      }
    } catch (err) {
      console.error('Failed to load agent color overrides', err);
    }
  };

  const checkBackendAvailability = async () => {
    try {
      // Import the backend service dynamically to avoid circular deps
      const { getLabRatsBackendAsync } = await import('../../services/labrats-backend-service');
      const backend = await getLabRatsBackendAsync();
      
      // Backend availability is already checked in getLabRatsBackendAsync
      if (!backend.available) {
        console.warn('LabRats backend not available');
        // Show warning modal instead of chat message
        setShowBackendWarning(true);
        // If already in single-agent mode, notify prompt manager
        if (singleAgentMode) {
          const promptManager = getPromptManager();
          promptManager.setSingleAgentMode(true);
        }
      } else {
        console.log('LabRats backend is available and ready');
        setShowBackendWarning(false);
        // Reset single agent mode when backend becomes available
        setSingleAgentMode(false);
        // Notify prompt manager that we're back to multi-agent mode
        const promptManager = getPromptManager();
        promptManager.setSingleAgentMode(false);
      }
    } catch (error) {
      console.error('Failed to check backend availability:', error);
      // Show warning modal for connection error
      setShowBackendWarning(true);
    }
  };

  const handleRecheckBackend = async () => {
    setBackendCheckInProgress(true);
    await checkBackendAvailability();
    setBackendCheckInProgress(false);
  };

  const handleGoToSettings = () => {
    setShowBackendWarning(false);
    // Navigate to settings using window events
    window.dispatchEvent(new CustomEvent('navigate-to-settings', {
      detail: { section: 'general', scrollTo: 'backend' }
    }));
  };

  const handleDismissWarning = () => {
    setShowBackendWarning(false);
  };
  
  const createSwitchyWelcomeMessage = (agent: Agent): Message => {
    return {
      id: `switchy_welcome_${Date.now()}`,
      content: `👋 **Hi! I'm Switchy, your full-stack AI assistant.**\n\nI'm running in single-agent mode since the LabRats.AI backend is unavailable. I can help you with:\n\n🎯 **Product Strategy** - Requirements, user stories, roadmaps\n💾 **Backend Development** - APIs, databases, server logic\n🎨 **Frontend Development** - UI/UX, components, styling\n🔍 **Quality Assurance** - Testing strategies, bug fixes\n🔒 **Security** - Vulnerability analysis, best practices\n⚙️ **DevOps** - Deployment, infrastructure, CI/CD\n🏗️ **Architecture** - System design, scalability\n📝 **Documentation** - Guides, specs, explanations\n\nWhat would you like to work on today?`,
      sender: agent,
      timestamp: new Date(),
      type: 'text'
    };
  };

  const handleContinueWithSingleAgent = () => {
    setSingleAgentMode(true);
    setShowBackendWarning(false);
    
    // Notify prompt manager about single-agent mode
    const promptManager = getPromptManager();
    promptManager.setSingleAgentMode(true);
    
    // Use the config agent if available, otherwise fall back to local definition
    const configSwitchy = configAgents.find(a => a.id === 'switchy');
    const agentToUse = configSwitchy ? {
      id: configSwitchy.id,
      name: configSwitchy.name,
      role: configSwitchy.title,
      color: 'dynamic',
      icon: Target,
      isActive: true,
      specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
    } : switchyAgent;
    
    setActiveAgents([agentToUse]);
    
    // Add welcome message for single-agent mode
    const welcomeMessage = createSwitchyWelcomeMessage(agentToUse);
    setMessages(prev => [...prev, welcomeMessage]);
    
    console.log('[CHAT] Switched to single-agent mode with Switchy');
  };

  const initializeAI = async () => {
    try {
      console.log('Getting available providers...');
      // Get available providers
      const providers = await providerManager.getAvailableProviders();
      console.log('Available providers:', providers.map(p => ({ id: p.id, name: p.name })));
      setAvailableProviders(providers);
      
      // Get default provider and model
      const defaultConfig = await providerManager.getDefault();
      console.log('Default config:', defaultConfig);
      if (defaultConfig) {
        setCurrentProviderId(defaultConfig.providerId);
        setCurrentModelId(defaultConfig.modelId);
        setIsAiEnabled(true);
        console.log(`Selected provider: ${defaultConfig.providerId} with model: ${defaultConfig.modelId}`);
      } else if (providers.length > 0) {
        // Use first available provider
        const firstProvider = providers[0];
        setCurrentProviderId(firstProvider.id);
        setCurrentModelId(firstProvider.config.defaultModel);
        setIsAiEnabled(true);
        console.log(`Fallback to first provider: ${firstProvider.id} with model: ${firstProvider.config.defaultModel}`);
      }
      console.log('AI initialization complete');
    } catch (error) {
      console.error('Failed to initialize AI providers:', error);
      // Don't fail completely, just disable AI features
      setIsAiEnabled(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const currentInput = inputValue;
    setInputValue('');
    
    // Add user message to chat immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      content: currentInput,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Generate title after first user message
    if (!titleGenerated && messages.filter(m => m.sender === 'user').length === 0) {
      generateChatTitle(currentInput);
    }
    
    // Handle single-agent mode
    if (singleAgentMode) {
      // Get the current Switchy agent
      const configSwitchy = configAgents.find(a => a.id === 'switchy');
      const currentSwitchy = configSwitchy ? {
        id: configSwitchy.id,
        name: configSwitchy.name,
        role: configSwitchy.title,
        color: 'dynamic',
        icon: Target,
        isActive: true,
        specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
      } : switchyAgent;
      
      // In single-agent mode, use direct chat service
      if (!isAiEnabled || !currentProviderId || !currentModelId) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `AI providers are not configured yet. Please configure your AI provider in settings to enable real AI responses.`,
          sender: currentSwitchy,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      try {
        setTypingAgents(new Set(['switchy']));
        
        // Get Switchy's full prompt from prompt manager
        const promptManager = getPromptManager();
        const switchyPrompt = await promptManager.getPrompt('switchy');
        const finalSystemPrompt = switchyPrompt || `You are Switchy, a full-stack AI assistant operating in single-agent mode. You can help with product strategy, backend development, frontend development, quality assurance, security, DevOps, architecture, and documentation. Provide helpful, practical responses to user requests.`;
        
        // Save system prompt and raw input for POV debug view
        setLastSystemPrompt(finalSystemPrompt);
        setLastRawInput(currentInput);
        
        // Track raw communication flow for POV mode
        const timestamp = new Date();
        setRawCommunicationFlow(prev => [
          ...prev,
          {
            id: `system_${Date.now()}`,
            type: 'system',
            content: `[SYSTEM PROMPT SENT]\n${finalSystemPrompt}`,
            timestamp
          },
          {
            id: `input_${Date.now() + 1}`,
            type: 'input',
            content: `[USER INPUT]\n${currentInput}`,
            timestamp: new Date(timestamp.getTime() + 100)
          }
        ]);
        
        // Use the LangChain chat service directly for single-agent mode
        const response = await chatService.sendMessage(currentInput, {
          providerId: currentProviderId,
          modelId: currentModelId,
          systemPrompt: finalSystemPrompt
        });

        if (response.success && response.message) {
          // Save raw output for POV debug view
          setLastRawOutput(response.message.content);
          
          // Add raw output to communication flow
          setRawCommunicationFlow(prev => [
            ...prev,
            {
              id: `output_${Date.now()}`,
              type: 'output',
              content: `[AI RESPONSE]\n${response.message?.content || ''}`,
              timestamp: new Date()
            }
          ]);
          
          const agentMessage: Message = {
            id: (Date.now() + 2).toString(),
            content: response.message.content,
            sender: currentSwitchy,
            timestamp: new Date(),
            type: 'text',
            providerId: currentProviderId,
            modelId: currentModelId
          };
          
          setMessages(prev => [...prev, agentMessage]);
        } else {
          throw new Error(response.error || 'Failed to get response');
        }
        
        setTypingAgents(new Set());
      } catch (error) {
        console.error('Single-agent response error:', error);
        setTypingAgents(new Set());
        
        const errorMessage: Message = {
          id: (Date.now() + 3).toString(),
          content: `I'm sorry, I encountered an error while processing your request. Please try again or check your AI provider configuration.`,
          sender: currentSwitchy,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      return;
    }
    
    // Multi-agent mode (original logic)
    // Check if AI is enabled and providers are available
    if (!isAiEnabled || !currentProviderId || !currentModelId) {
      // Fallback to mock response
      const currentAgent = agents.find(a => a.id === 'cortex') || agents[0]; // Use Cortex agent
      setTypingAgents(new Set(['cortex']));
      
      setTimeout(() => {
        const response: Message = {
          id: (Date.now() + 1).toString(),
          content: `AI providers are not configured yet. Please configure your AI provider in settings to enable real AI responses.`,
          sender: currentAgent,
          timestamp: new Date(),
          type: 'text'
        };
        
        setMessages(prev => [...prev, response]);
        setTypingAgents(new Set());
      }, 2000);
      return;
    }

    try {
      // Check actual bus state instead of local state to avoid race conditions
      if (!messageBus.isActive) {
        // Start message bus
        await messageBus.startBus(currentInput);
        setIsBusActive(true);
        
        // Update active agents list
        const activeAgentIds = messageBus.activeAgents;
        setActiveAgents(agents.filter(a => activeAgentIds.includes(a.id)));
        
        // Update agent token usage
        const tokenUsage = messageBus.getAllAgentsTokenUsage();
        setAgentTokenUsage(tokenUsage);
      } else {
        // Send message to bus
        await messageBus.sendUserMessage(currentInput);
      }
      
      // Ensure local state is synchronized with bus state
      if (messageBus.isActive && !isBusActive) {
        setIsBusActive(true);
      }
    } catch (error) {
      console.error('Message bus response error:', error);
      setTypingAgents(new Set());
      
      // Add error message
      const cortexAgent = agents.find(a => a.id === 'cortex') || agents[0];
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: `Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your AI provider configuration.`,
        sender: cortexAgent,
        timestamp: new Date(),
        type: 'text'
      };
      
      setMessages(prev => [...prev, errorMessage]);
    }
    
    // Trigger code review workflow after certain messages
    if (currentInput.toLowerCase().includes('implement') || currentInput.toLowerCase().includes('code')) {
      setTimeout(() => {
        onCodeReview({
          files: ['src/components/Chat.tsx', 'src/components/Sidebar.tsx'],
          changes: 156,
          additions: 134,
          deletions: 22
        });
      }, 5000);
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    
    // Check if we should show mention autocomplete
    const lastAtIndex = value.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setShowMentionAutocomplete(true);
        setCursorPosition(lastAtIndex + textAfterAt.length + 1);
      } else {
        setShowMentionAutocomplete(false);
      }
    } else {
      setShowMentionAutocomplete(false);
    }
  };

  const handleMentionSelect = (newValue: string) => {
    setInputValue(newValue);
    setShowMentionAutocomplete(false);
    // Focus back on input
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionAutocomplete && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      // Let the MentionAutocomplete component handle these keys
      return;
    }
  };

  const copyMessage = async (message: Message) => {
    try {
      const sender = message.sender === 'user' ? 'User' : (message.sender as Agent).name;
      const timestamp = message.timestamp.toLocaleString();
      const content = `[${timestamp}] ${sender}: ${message.content}`;
      
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const copyEntireChat = async () => {
    try {
      const chatContent = messages.map(message => {
        const sender = message.sender === 'user' ? 'User' : (message.sender as Agent).name;
        const timestamp = message.timestamp.toLocaleString();
        return `[${timestamp}] ${sender}: ${message.content}`;
      }).join('\n\n');
      
      const debugInfo = `=== CHAT EXPORT ===
Messages: ${messages.length}
Active Agents: ${activeAgents.map(a => a.name).join(', ')}
Bus Active: ${isBusActive}
AI Provider: ${currentProviderId}
Model: ${currentModelId}
Timestamp: ${new Date().toLocaleString()}

=== CONVERSATION ===
${chatContent}

=== DEBUG INFO ===
To debug the message bus, open console and type: debugBus()
`;
      
      await navigator.clipboard.writeText(debugInfo);
      setCopiedChat(true);
      setTimeout(() => setCopiedChat(false), 2000);
      setShowChatMenu(false);
    } catch (error) {
      console.error('Failed to copy chat:', error);
    }
  };

  const archiveChat = async () => {
    if (!currentFolder) return;
    
    try {
      // Save current chat to archive with timestamp
      const archiveTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveProjectPath = `${currentFolder}_archive_${archiveTimestamp}`;
      
      // Convert Message format to ChatServiceMessage
      const chatServiceMessages: ChatServiceMessage[] = messages.map(msg => ({
        id: msg.id,
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        agentId: msg.sender !== 'user' ? (msg.sender as Agent).id : undefined,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
      
      // Save to archive
      await chatHistoryManager.saveChatHistory(archiveProjectPath, chatServiceMessages);
      
      // Clear current chat
      setMessages([]);
      messageBus.reset();
      baseChatService.clearConversation();
      chatService.clearSessionTokenUsage();
      messageBus.clearSessionTokenUsage();
      // In single-agent mode, keep Switchy; otherwise reset to Cortex
      if (singleAgentMode) {
        const configSwitchy = configAgents.find(a => a.id === 'switchy');
        const switchyAgent = configSwitchy ? {
          id: configSwitchy.id,
          name: configSwitchy.name,
          role: configSwitchy.title,
          color: 'dynamic',
          icon: Target,
          isActive: true,
          specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
        } : {
          id: 'switchy',
          name: 'Switchy',
          role: 'Full-Stack AI Assistant',
          color: 'dynamic',
          icon: Target,
          isActive: true,
          specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
        };
        setActiveAgents([switchyAgent]);
        // Add welcome message for Switchy
        const welcomeMessage = createSwitchyWelcomeMessage(switchyAgent);
        setMessages([welcomeMessage]);
      } else {
        setActiveAgents(agents.filter(a => a.id === 'cortex'));
      }
      setIsBusActive(false);
      setAgentsPaused(false);
      setShowChatMenu(false);
      // Reset chat title
      setChatTitle('Agent Chat');
      setTitleGenerated(false);
      const resetUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
      setSessionTokenUsage(resetUsage);
      onTokenUsageChange?.(resetUsage);
      
      console.log(`[CHAT] Archived chat to ${archiveProjectPath}`);
    } catch (error) {
      console.error('Failed to archive chat:', error);
    }
  };

  const deleteChat = async () => {
    if (!currentFolder) return;
    
    const confirmed = window.confirm('Are you sure you want to delete the current chat? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      // Clear chat history
      await chatHistoryManager.clearChatHistory(currentFolder);
      
      // Clear current chat
      setMessages([]);
      messageBus.reset();
      baseChatService.clearConversation();
      chatService.clearSessionTokenUsage();
      messageBus.clearSessionTokenUsage();
      // In single-agent mode, keep Switchy; otherwise reset to Cortex
      if (singleAgentMode) {
        const configSwitchy = configAgents.find(a => a.id === 'switchy');
        const switchyAgent = configSwitchy ? {
          id: configSwitchy.id,
          name: configSwitchy.name,
          role: configSwitchy.title,
          color: 'dynamic',
          icon: Target,
          isActive: true,
          specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
        } : {
          id: 'switchy',
          name: 'Switchy',
          role: 'Full-Stack AI Assistant',
          color: 'dynamic',
          icon: Target,
          isActive: true,
          specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
        };
        setActiveAgents([switchyAgent]);
        // Add welcome message for Switchy
        const welcomeMessage = createSwitchyWelcomeMessage(switchyAgent);
        setMessages([welcomeMessage]);
      } else {
        setActiveAgents(agents.filter(a => a.id === 'cortex'));
      }
      setIsBusActive(false);
      setAgentsPaused(false);
      setShowChatMenu(false);
      // Reset chat title
      setChatTitle('Agent Chat');
      setTitleGenerated(false);
      const resetUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
      setSessionTokenUsage(resetUsage);
      onTokenUsageChange?.(resetUsage);
      
      console.log(`[CHAT] Deleted chat for ${currentFolder}`);
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const generateChatTitle = async (userMessage: string) => {
    if (titleGenerated) return; // Only generate once per chat
    
    try {
      // Always use the chat service for title generation if AI is enabled
      if (isAiEnabled && currentProviderId && currentModelId) {
        const response = await chatService.sendMessage(
          `Generate a very short (2-4 words) chat title for this request: "${userMessage}". Respond with ONLY the title.`,
          {
            providerId: currentProviderId,
            modelId: currentModelId,
            systemPrompt: 'You are a helpful assistant that generates concise chat titles.'
          }
        );
        
        if (response.success && response.message) {
          const title = response.message.content.trim().replace(/['"]/g, '');
          if (title && title.length < 50) { // Sanity check
            setChatTitle(title);
            setTitleGenerated(true);
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate chat title:', error);
      // Keep default title on error
    }
  };

  const getAgentColorHex = (agent: Agent): string => {
    // Check for override first
    if (agentColorOverrides[agent.id]) {
      return agentColorOverrides[agent.id];
    }
    
    // Find agent in config and return its color
    const configAgent = configAgents.find(a => a.id === agent.id);
    if (configAgent) {
      return configAgent.colorAccent;
    }
    
    // Fallback to mapping from legacy color names
    const colors = {
      blue: '#3b82f6',
      red: '#ef4444',
      orange: '#f97316',
      green: '#22c55e',
      purple: '#a855f7',
      indigo: '#6366f1',
      teal: '#14b8a6',
      gray: '#6b7280',
      slate: '#64748b',
      cyan: '#06b6d4',
      rose: '#f43f5e',
      violet: '#8b5cf6',
      amber: '#f59e0b'
    };
    return colors[agent.color as keyof typeof colors] || '#6b7280';
  };

  const getAgentAvatar = (agent: Agent): string | null => {
    const configAgent = configAgents.find(a => a.id === agent.id);
    return configAgent?.avatar || null;
  };

  const getAgentColor = (agent: Agent) => {
    const colors = {
      blue: 'bg-blue-500',
      red: 'bg-red-500',
      orange: 'bg-orange-500',
      green: 'bg-green-500',
      purple: 'bg-purple-500',
      indigo: 'bg-indigo-500',
      teal: 'bg-teal-500',
      gray: 'bg-gray-500',
      slate: 'bg-slate-500',
      cyan: 'bg-cyan-500',
      rose: 'bg-rose-500',
      violet: 'bg-violet-500',
      amber: 'bg-amber-500'
    };
    return colors[agent.color as keyof typeof colors] || 'bg-gray-500';
  };

  const getAgentTextColor = (agent: Agent) => {
    const colors = {
      blue: 'text-blue-400',
      red: 'text-red-400', 
      orange: 'text-orange-400',
      green: 'text-green-400',
      purple: 'text-purple-400',
      indigo: 'text-indigo-400',
      teal: 'text-teal-400',
      gray: 'text-gray-400',
      slate: 'text-slate-400',
      cyan: 'text-cyan-400',
      rose: 'text-rose-400',
      violet: 'text-violet-400',
      amber: 'text-amber-400'
    };
    return colors[agent.color as keyof typeof colors] || 'text-gray-400';
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">
              {povMode.enabled && povMode.agentId ? (
                <div className="flex items-center space-x-2">
                  <span>{chatTitle}</span>
                  <span className="text-sm text-gray-400">•</span>
                  <span className="text-sm text-yellow-400">POV: {(singleAgentMode ? activeAgents : agents).find(a => a.id === povMode.agentId)?.name}</span>
                </div>
              ) : (
                chatTitle
              )}
            </h2>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Active Agents Dropdown */}
            <div className="relative" ref={agentsDropdownRef}>
              <button
                onClick={() => setShowAgentsDropdown(!showAgentsDropdown)}
                className="flex items-center space-x-2 px-3 py-1 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
                title="View active agents"
              >
                <Users className="w-4 h-4 text-gray-300" />
                <span className="text-sm text-gray-300">{activeAgents.length}</span>
              </button>
              
              {showAgentsDropdown && activeAgents.length > 0 && (
                <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-2 z-50">
                  <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-700 mb-2">
                    Active Agents ({activeAgents.length})
                  </div>
                  {activeAgents.map((agent) => {
                    const avatar = getAgentAvatar(agent);
                    return (
                      <div key={agent.id} className="flex items-center space-x-3 px-3 py-2 hover:bg-gray-700 transition-colors relative">
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getAgentColorHex(agent) }}
                        ></div>
                        {avatar ? (
                          <img 
                            src={avatar} 
                            alt={agent.name}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <agent.icon className="w-6 h-6 text-gray-300" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium">{agent.name}</div>
                          <div className="text-xs text-gray-400 truncate">{agent.role}</div>
                          {agentTokenUsage.has(agent.id) && (() => {
                            const usage = agentTokenUsage.get(agent.id)!;
                            return (
                              <div className="flex items-center space-x-3 mt-1 text-xs">
                                <div className="flex items-center space-x-1">
                                  <ArrowUp className="w-3 h-3 text-blue-400" />
                                  <span className="text-gray-400">{usage.promptTokens.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <ArrowDown className="w-3 h-3 text-green-400" />
                                  <span className="text-gray-400">{usage.completionTokens.toLocaleString()}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        
                        {/* Kebab menu */}
                        <div className="relative" ref={(el) => {
                          if (el) {
                            agentMenuRefs.current.set(agent.id, el);
                          }
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAgentMenu(showAgentMenu === agent.id ? null : agent.id);
                            }}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-600"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {showAgentMenu === agent.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-gray-700 rounded-lg shadow-lg border border-gray-600 py-1 z-50">
                              <button
                                onClick={() => {
                                  setPovMode({ enabled: true, agentId: agent.id });
                                  setShowAgentMenu(null);
                                  setShowAgentsDropdown(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
                              >
                                <div className="flex items-center space-x-2">
                                  <User className="w-4 h-4" />
                                  <span>Enter POV Mode</span>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Menu Button */}
            <div className="relative" ref={chatMenuRef}>
              <button
                onClick={() => setShowChatMenu(!showChatMenu)}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
                title="Chat options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {showChatMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 z-50">
                  <button
                    onClick={copyEntireChat}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center space-x-2"
                  >
                    {copiedChat ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Chat</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={archiveChat}
                    className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center space-x-2"
                    disabled={!currentFolder || messages.length === 0}
                  >
                    <Archive className="w-4 h-4" />
                    <span>Archive Chat</span>
                  </button>
                  
                  <div className="border-t border-gray-700 my-1"></div>
                  
                  <button
                    onClick={deleteChat}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors flex items-center space-x-2"
                    disabled={!currentFolder || messages.length === 0}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Chat</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scroll-smooth">
        {(() => {
          // Special handling for POV mode - show raw communication flow
          if (povMode.enabled && povMode.agentId && (singleAgentMode || !singleAgentMode)) {
            // For multi-agent mode, create a flow from agent context
            let flowToRender = rawCommunicationFlow;
            
            if (!singleAgentMode) {
              // Build flow from agent context
              const agentContext = messageBus.getAgentContext ? messageBus.getAgentContext(povMode.agentId) : null;
              flowToRender = [];
              
              if (agentContext) {
                // Add system prompt if available
                if (agentContext.lastSystemPrompt) {
                  flowToRender.push({
                    id: `${povMode.agentId}-prompt`,
                    type: 'system',
                    content: agentContext.lastSystemPrompt,
                    timestamp: new Date()
                  });
                }
                
                // Add context/input if available
                if (agentContext.lastContext) {
                  flowToRender.push({
                    id: `${povMode.agentId}-context`,
                    type: 'input',
                    content: agentContext.lastContext,
                    timestamp: new Date()
                  });
                }
                
                // Add raw response if available
                if (agentContext.lastRawResponse) {
                  flowToRender.push({
                    id: `${povMode.agentId}-response`,
                    type: 'output',
                    content: agentContext.lastRawResponse,
                    timestamp: new Date()
                  });
                }
              }
            }
            
            // If single-agent mode but not Switchy, return normal messages
            if (singleAgentMode && povMode.agentId !== 'switchy') {
              // Fall through to normal message display
            } else if (flowToRender.length > 0) {
              return flowToRender.map((flow) => {
              const isSystem = flow.type === 'system';
              const isInput = flow.type === 'input';
              const isOutput = flow.type === 'output';
              
              return (
                <div key={flow.id} className="w-full">
                  {isSystem && (
                    <div className="flex space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                          <Settings className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 bg-purple-900/20 border border-purple-700 rounded-lg p-4">
                        <div className="text-xs text-purple-400 mb-1">System Prompt to LangChain</div>
                        <pre className="text-white text-sm whitespace-pre-wrap font-mono">{flow.content}</pre>
                        <div className="text-xs text-gray-500 mt-2">{flow.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  )}
                  
                  {isInput && (
                    <div className="flex space-x-3 justify-end">
                      <div className="max-w-2xl bg-blue-600 rounded-lg p-4">
                        <div className="text-xs text-blue-200 mb-1">Raw User Input to LangChain</div>
                        <pre className="text-white text-sm whitespace-pre-wrap font-mono">{flow.content}</pre>
                        <div className="text-xs text-blue-300 mt-2">{flow.timestamp.toLocaleTimeString()}</div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {isOutput && (
                    <div className="flex space-x-3">
                      <div className="flex-shrink-0">
                        {(() => {
                          const agent = singleAgentMode 
                            ? activeAgents[0] 
                            : agents.find(a => a.id === povMode.agentId);
                          const avatar = agent ? getAgentAvatar(agent) : null;
                          return avatar ? (
                            <img 
                              src={avatar} 
                              alt={agent?.name || 'Agent'}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex-1 bg-green-900/20 border border-green-700 rounded-lg p-4">
                        <div className="text-xs text-green-400 mb-1">Raw AI Response from LangChain</div>
                        <pre className="text-white text-sm whitespace-pre-wrap font-mono">{flow.content}</pre>
                        <div className="text-xs text-gray-500 mt-2">{flow.timestamp.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            });
            } else if (!singleAgentMode && flowToRender.length === 0) {
              // No raw communication yet for this agent
              return (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <Bot className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-lg">{agents.find(a => a.id === povMode.agentId)?.name} hasn't been invoked yet</p>
                    <p className="text-sm mt-2">Raw communication will appear here when they respond</p>
                  </div>
                </div>
              );
            }
          }
          
          // Normal message display logic
          let displayMessages = messages;
          
          if (povMode.enabled && povMode.agentId && !singleAgentMode) {
            // Get agent's personal message history from the message bus
            const agentHistory = messageBus.getAgentPersonalHistory ? messageBus.getAgentPersonalHistory(povMode.agentId) : [];
            
            // Convert bus messages to display messages
            displayMessages = messages.filter(msg => {
              // Show messages in agent's personal history OR messages from the agent themselves
              const isInHistory = agentHistory.some(busMsg => busMsg.id === msg.id);
              const isFromAgent = msg.sender !== 'user' && (msg.sender as Agent).id === povMode.agentId;
              return isInHistory || isFromAgent;
            });
            
            // If no personal history yet, show a message
            if (displayMessages.length === 0) {
              return (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <User className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-lg">{(singleAgentMode ? activeAgents : agents).find(a => a.id === povMode.agentId)?.name} hasn't seen any messages yet</p>
                    <p className="text-sm mt-2">They will only see messages when they decide to participate</p>
                  </div>
                </div>
              );
            }
          }
          
          return displayMessages.map((message) => {
          const isUser = message.sender === 'user';
          const isPovAgent = povMode.enabled && povMode.agentId && message.sender !== 'user' && (message.sender as Agent).id === povMode.agentId;
          const shouldShowOnRight = isUser || isPovAgent;
          
          return (
          <div key={message.id} className="w-full">
            {shouldShowOnRight ? (
              // User messages - now with full width and styled markdown
              <div className="w-full bg-blue-600 rounded-lg p-4 group">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center flex-shrink-0">
                    {isPovAgent ? (
                      (() => {
                        const agent = message.sender as Agent;
                        const avatar = getAgentAvatar(agent);
                        return avatar ? (
                          <img src={avatar} alt={agent.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <agent.icon className="w-4 h-4 text-white" />
                        );
                      })()
                    ) : (
                      <User className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-medium text-white">
                      {isPovAgent ? (message.sender as Agent).name : 'You'}
                    </span>
                    <span className="text-xs text-blue-200">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={() => copyMessage(message)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-blue-200 hover:text-white transition-all"
                    title="Copy message"
                  >
                    {copiedMessageId === message.id ? <Check className="w-3 h-3 text-green-300" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                
                <div className="pl-11">
                  <div 
                    className="text-white text-sm leading-relaxed markdown-content user-message"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                  />
                </div>
              </div>
            ) : (
              // Agent messages - use full width
              <div className="w-full bg-gray-700 rounded-lg p-4 group">
                <div className="flex items-center space-x-3 mb-3">
                  {(() => {
                    const avatar = getAgentAvatar(message.sender as Agent);
                    return avatar ? (
                      <img 
                        src={avatar} 
                        alt={(message.sender as Agent).name}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        style={{ border: `2px solid ${getAgentColorHex(message.sender as Agent)}` }}
                      />
                    ) : (
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: getAgentColorHex(message.sender as Agent) }}
                      >
                        {React.createElement((message.sender as Agent).icon, { className: "w-4 h-4 text-white" })}
                      </div>
                    );
                  })()}
                  <div className="flex items-center space-x-2 flex-1">
                    <span 
                      className="font-medium"
                      style={{ color: getAgentColorHex(message.sender as Agent) }}
                    >
                      {(message.sender as Agent).name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={() => copyMessage(message)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-white transition-all"
                    title="Copy message"
                  >
                    {copiedMessageId === message.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                
                <div className="pl-11">
                  <div 
                    className="text-white text-sm leading-relaxed markdown-content"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                  />
                  
                  {message.metadata && (
                    <div className="mt-3 p-3 bg-gray-600 rounded border-l-4 border-blue-500">
                      <div className="flex items-center space-x-4 text-xs text-gray-300">
                        {message.metadata.codeChanges && (
                          <span>📝 {message.metadata.codeChanges} changes</span>
                        )}
                        {message.metadata.filesAffected && (
                          <span>📁 {message.metadata.filesAffected.length} files</span>
                        )}
                        {message.metadata.reviewStatus && (
                          <span className={`flex items-center space-x-1 ${
                            message.metadata.reviewStatus === 'approved' ? 'text-green-400' :
                            message.metadata.reviewStatus === 'rejected' ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {message.metadata.reviewStatus === 'approved' && <CheckCircle className="w-3 h-3" />}
                            {message.metadata.reviewStatus === 'rejected' && <XCircle className="w-3 h-3" />}
                            {message.metadata.reviewStatus === 'pending' && <Clock className="w-3 h-3" />}
                            <span>{message.metadata.reviewStatus}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        });
        })()}
        
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input or POV Info Panel */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 flex-shrink-0">
        {povMode.enabled && povMode.agentId ? (
          // POV Mode Info Panel
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                {(() => {
                  // In single-agent mode, check Switchy
                  const agent = singleAgentMode && povMode.agentId === 'switchy' 
                    ? activeAgents.find(a => a.id === 'switchy')
                    : agents.find(a => a.id === povMode.agentId);
                  if (!agent) return null;
                  const avatar = getAgentAvatar(agent);
                  return (
                    <>
                      {avatar ? (
                        <img src={avatar} alt={agent.name} className="w-6 h-6 rounded-full" />
                      ) : (
                        <agent.icon className="w-6 h-6" style={{ color: getAgentColorHex(agent) }} />
                      )}
                      <span>{agent.name}'s Perspective</span>
                    </>
                  );
                })()}
              </h3>
              <button
                onClick={() => setPovMode({ enabled: false, agentId: null })}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Exit POV Mode
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              {(() => {
                // In single-agent mode, check active agents
                const agent = singleAgentMode && povMode.agentId === 'switchy'
                  ? activeAgents.find(a => a.id === 'switchy')
                  : agents.find(a => a.id === povMode.agentId);
                const agentContext = messageBus.getAgentContext ? messageBus.getAgentContext(povMode.agentId) : null;
                const tokenUsage = singleAgentMode 
                  ? sessionTokenUsage // In single-agent mode, use session totals
                  : agentTokenUsage.get(povMode.agentId);
                
                return (
                  <>
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Role</div>
                      <div className="text-white">{agent?.role}</div>
                    </div>
                    
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Session ID</div>
                      <div className="text-white text-xs font-mono truncate" title={agentContext?.sessionId}>
                        {agentContext?.sessionId || 'N/A'}
                      </div>
                    </div>
                    
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Current Action</div>
                      <div className="text-white">{agentContext?.currentAction || 'N/A'}</div>
                    </div>
                    
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Token Usage</div>
                      <div className="flex items-center space-x-3 text-white">
                        <div className="flex items-center space-x-1">
                          <ArrowUp className="w-3 h-3 text-blue-400" />
                          <span>{tokenUsage?.promptTokens.toLocaleString() || 0}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <ArrowDown className="w-3 h-3 text-green-400" />
                          <span>{tokenUsage?.completionTokens.toLocaleString() || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Messages Seen</div>
                      <div className="text-white">
                        {messageBus.getAgentPersonalHistory ? messageBus.getAgentPersonalHistory(povMode.agentId).length : 0}
                      </div>
                    </div>
                    
                    <div className="bg-gray-700 p-3 rounded-lg">
                      <div className="text-gray-400 mb-1">Last Response</div>
                      <div className="text-white">
                        {agentContext?.lastResponseTime 
                          ? new Date(agentContext.lastResponseTime).toLocaleTimeString() 
                          : 'No response yet'}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            
            
            <div className="text-center text-gray-400 text-sm">
              <>
                <p>You are viewing the raw LangChain communication flow for {(singleAgentMode ? activeAgents : agents).find(a => a.id === povMode.agentId)?.name}.</p>
                <p className="mt-1">This shows exactly what is sent to and received from the AI service.</p>
                <p className="mt-1 text-xs">Purple = System Prompt | Blue = User Input | Green = AI Response</p>
              </>
            </div>
          </div>
        ) : (
          <>
        {/* Multiple Typing Indicators */}
        {typingAgents.size > 0 && (
          <div className="mb-3 space-y-2">
            {Array.from(typingAgents).map(agentId => {
              let agent = agents.find(a => a.id === agentId);
              
              // Handle Switchy specially
              if (!agent && agentId === 'switchy') {
                const configSwitchy = configAgents.find(a => a.id === 'switchy');
                agent = configSwitchy ? {
                  id: configSwitchy.id,
                  name: configSwitchy.name,
                  role: configSwitchy.title,
                  color: 'dynamic',
                  icon: Target,
                  isActive: true,
                  specialization: ['product', 'backend', 'frontend', 'qa', 'security', 'devops', 'architecture', 'documentation']
                } : switchyAgent;
              }
              
              if (!agent) return null;
              
              return (
                <div key={agentId} className="flex items-center space-x-2 text-xs text-gray-400">
                  {(() => {
                    const avatar = getAgentAvatar(agent);
                    return avatar ? (
                      <img 
                        src={avatar} 
                        alt={agent.name}
                        className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                        style={{ border: `1px solid ${getAgentColorHex(agent)}` }}
                      />
                    ) : (
                      <div 
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: getAgentColorHex(agent) }}
                      >
                        {React.createElement(agent.icon, { className: "w-2.5 h-2.5 text-white" })}
                      </div>
                    );
                  })()}
                  <span style={{ color: getAgentColorHex(agent) }}>
                    {agent.name} is typing
                  </span>
                  <div className="flex space-x-0.5">
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <form onSubmit={handleSend} className="flex space-x-3 relative">
          <div className="flex-1 relative">
            <RichTextInput
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onSubmit={() => handleSend({ preventDefault: () => {} } as React.FormEvent)}
              onKeyDown={handleInputKeyDown}
              placeholder="Describe what you want to build... (Use @agent to mention team members)"
            />
            {showMentionAutocomplete && (
              <MentionAutocomplete
                inputValue={inputValue}
                cursorPosition={cursorPosition}
                onSelect={handleMentionSelect}
                onClose={() => setShowMentionAutocomplete(false)}
                singleAgentMode={singleAgentMode}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
          {isBusActive && (
            <button
              type="button"
              onClick={() => {
                if (agentsPaused) {
                  messageBus.resume();
                } else {
                  messageBus.pause();
                }
              }}
              className={`px-4 py-3 ${agentsPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white rounded-lg font-medium transition-colors flex items-center space-x-2`}
            >
              {agentsPaused ? (
                <>
                  <Play className="w-4 h-4" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </>
              )}
            </button>
          )}
        </form>
        
        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {isBusActive 
              ? agentsPaused 
                ? `Agents paused • You can still send messages`
                : `Message bus active • Mention @agent to invite them`
              : 'Cortex will guide the conversation and coordinate the team'
            }
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-4">
              {messages.length > 0 && (
                <div className="text-xs text-purple-400 flex items-center space-x-1">
                  <MessageSquare className="w-3 h-3" />
                  <span>{messages.length} messages</span>
                </div>
              )}
              {sessionTokenUsage.totalTokens > 0 && (
                <div className="text-xs text-blue-400 flex items-center space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>{sessionTokenUsage.totalTokens.toLocaleString()} tokens</span>
                  <span className="text-gray-500">({sessionTokenUsage.promptTokens.toLocaleString()} in + {sessionTokenUsage.completionTokens.toLocaleString()} out)</span>
                </div>
              )}
            </div>
            {isAiEnabled && currentProviderId && (
              <div className="text-xs text-green-400 flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>{currentProviderId}</span>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Backend Warning Modal */}
      {showBackendWarning && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleDismissWarning}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-md mx-4 border border-gray-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="text-yellow-500" size={24} />
              <h3 className="text-lg font-semibold text-white">LabRats.AI Backend Unavailable</h3>
            </div>
            
            <div className="text-gray-300 mb-6 space-y-3">
              <p>The multi-agent chat system requires the LabRats.AI backend to be running. Without it:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Only single-agent chat is available</li>
                <li>Agent filtering and decision-making is disabled</li>
              </ul>
              <p className="text-sm">To enable multi-agent features:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Go to Settings → Backend</li>
                <li>Configure your LabRats.AI backend endpoint</li>
                <li>Ensure the backend service is running</li>
              </ol>
              <p className="text-yellow-400 text-sm font-medium">Current status: <span className="text-red-400">Disconnected</span></p>
            </div>
            
            <div className="flex flex-col space-y-3">
              <div className="flex space-x-3">
                <button
                  onClick={handleRecheckBackend}
                  disabled={backendCheckInProgress}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2"
                >
                  {backendCheckInProgress ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span>Recheck</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={handleGoToSettings}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2"
                >
                  <Settings size={16} />
                  <span>Go to Settings</span>
                </button>
              </div>
              
              <button
                onClick={handleContinueWithSingleAgent}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <Target size={16} />
                <span>Continue with Single Agent</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        /* User message markdown styling */
        .markdown-content.user-message {
          color: white;
        }
        
        .markdown-content.user-message strong {
          color: white;
          font-weight: 700;
        }
        
        .markdown-content.user-message em {
          color: white;
          opacity: 0.95;
        }
        
        .markdown-content.user-message code {
          color: #bfdbfe;
          background-color: rgba(30, 58, 138, 0.5);
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
        }
        
        .markdown-content.user-message pre {
          background-color: rgba(30, 58, 138, 0.5);
          border: 1px solid rgba(147, 197, 253, 0.3);
          color: white;
        }
        
        .markdown-content.user-message pre code {
          background-color: transparent;
          color: white;
        }
        
        .markdown-content.user-message h1,
        .markdown-content.user-message h2,
        .markdown-content.user-message h3 {
          color: white;
          font-weight: 700;
        }
        
        .markdown-content.user-message ul,
        .markdown-content.user-message ol {
          color: white;
        }
        
        .markdown-content.user-message blockquote {
          border-left-color: rgba(147, 197, 253, 0.5);
          color: rgba(255, 255, 255, 0.9);
        }
        
        .markdown-content.user-message a {
          color: #bfdbfe;
          text-decoration: underline;
        }
        
        .markdown-content.user-message a:hover {
          color: #dbeafe;
        }
      `}</style>
    </div>
  );
};