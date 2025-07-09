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
  Download
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

export const Chat: React.FC<ChatProps> = ({ onCodeReview, currentFolder }) => {
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
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

    // Listen for config changes to reload color overrides
    const handleConfigChange = () => {
      loadAgentColorOverrides();
    };
    
    // Set up periodic check for config changes (simple solution)
    const interval = setInterval(loadAgentColorOverrides, 1000);
    
    // Set up message bus event listeners
    const handleBusMessage = (message: BusMessage) => {
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
      
      // Update token usage from chat service
      const tokenUsage = chatService.getSessionTokenUsage();
      setSessionTokenUsage(tokenUsage);
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
        setSessionTokenUsage({ completionTokens: 0, promptTokens: 0, totalTokens: 0 });
      }
    };
    
    loadPersistedMessages();
  }, [currentFolder]);

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

  // Handle clicking outside of chat menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setInputValue(value);
    setCursorPosition(cursorPos);
    
    // Check if we should show mention autocomplete
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ')) {
        setShowMentionAutocomplete(true);
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      setActiveAgents(agents.filter(a => a.id === 'cortex'));
      setIsBusActive(false);
      setAgentsPaused(false);
      setShowChatMenu(false);
      setSessionTokenUsage({ completionTokens: 0, promptTokens: 0, totalTokens: 0 });
      
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
      setActiveAgents(agents.filter(a => a.id === 'cortex'));
      setIsBusActive(false);
      setAgentsPaused(false);
      setShowChatMenu(false);
      setSessionTokenUsage({ completionTokens: 0, promptTokens: 0, totalTokens: 0 });
      
      console.log(`[CHAT] Deleted chat for ${currentFolder}`);
    } catch (error) {
      console.error('Failed to delete chat:', error);
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
            <h2 className="text-lg font-semibold text-white">Agent Chat</h2>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">{activeAgents.length} agents active</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Active Agents */}
            <div className="flex items-center space-x-2">
              {activeAgents.map((agent) => {
                const avatar = getAgentAvatar(agent);
                return (
                  <div key={agent.id} className="flex items-center space-x-2 px-3 py-1 bg-gray-700 rounded-full">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getAgentColorHex(agent) }}
                    ></div>
                    {avatar ? (
                      <img 
                        src={avatar} 
                        alt={agent.name}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    ) : (
                      <agent.icon className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-xs text-gray-300">{agent.name}</span>
                  </div>
                );
              })}
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
        {messages.map((message) => (
          <div key={message.id} className="w-full">
            {message.sender === 'user' ? (
              // User messages - keep existing style with max width
              <div className="flex space-x-3 justify-end group">
                <div className="max-w-2xl bg-blue-600 rounded-lg p-4 relative">
                  <p className="text-white text-sm leading-relaxed">{message.content}</p>
                  <button
                    onClick={() => copyMessage(message)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-blue-200 hover:text-white transition-all"
                    title="Copy message"
                  >
                    {copiedMessageId === message.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
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
        ))}
        
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 flex-shrink-0">
        {/* Multiple Typing Indicators */}
        {typingAgents.size > 0 && (
          <div className="mb-3 space-y-2">
            {Array.from(typingAgents).map(agentId => {
              const agent = agents.find(a => a.id === agentId);
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
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Describe what you want to build... (Use @agent to mention team members)"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {showMentionAutocomplete && (
              <MentionAutocomplete
                inputValue={inputValue}
                cursorPosition={cursorPosition}
                onSelect={handleMentionSelect}
                onClose={() => setShowMentionAutocomplete(false)}
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
            {sessionTokenUsage.totalTokens > 0 && (
              <div className="text-xs text-blue-400 flex items-center space-x-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>{sessionTokenUsage.totalTokens.toLocaleString()} tokens</span>
                <span className="text-gray-500">({sessionTokenUsage.promptTokens.toLocaleString()} in + {sessionTokenUsage.completionTokens.toLocaleString()} out)</span>
              </div>
            )}
            {isAiEnabled && currentProviderId && (
              <div className="text-xs text-green-400 flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>{currentProviderId}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};