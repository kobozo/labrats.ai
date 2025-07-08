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
  FileText
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getLangChainChatService } from '../../services/langchain-chat-service';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { getPromptManager } from '../../services/prompt-manager';
import { agents as configAgents, Agent as ConfigAgent } from '../../config/agents';
import { stateManager } from '../../services/state-manager';
import { getChatService, ChatServiceMessage } from '../../services/chat-service';

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
  const [isTyping, setIsTyping] = useState(false);
  const [typingAgent, setTypingAgent] = useState<Agent | null>(null);
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [agentColorOverrides, setAgentColorOverrides] = useState<{ [key: string]: string }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatService = getLangChainChatService();
  const providerManager = getAIProviderManager();
  const baseChatService = getChatService();

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
    
    return () => clearInterval(interval);
  }, []);

  // Load persisted messages when component mounts or folder changes
  useEffect(() => {
    const loadPersistedMessages = async () => {
      if (currentFolder) {
        // Set current project in chat services
        chatService.setCurrentProject(currentFolder);
        
        // Load messages from state manager
        const persistedMessages = stateManager.getChatMessages();
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
        }
        
        // Load conversation history into chat service
        const conversationHistory = stateManager.getChatConversationHistory();
        if (conversationHistory.length > 0) {
          baseChatService.clearConversation();
          conversationHistory.forEach(msg => {
            (baseChatService as any).conversationHistory.push(msg);
          });
        }
      } else {
        // Clear messages when no folder is open
        setMessages([]);
        baseChatService.clearConversation();
        chatService.setCurrentProject(null);
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
      
      stateManager.setChatMessages(chatServiceMessages);
      
      // Also persist conversation history from chat service
      const conversationHistory = baseChatService.getConversationHistory();
      stateManager.setChatConversationHistory(conversationHistory);
    }
  }, [messages, currentFolder]);

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

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    
    // Check if AI is enabled and providers are available
    if (!isAiEnabled || !currentProviderId || !currentModelId) {
      // Fallback to mock response
      setIsTyping(true);
      const currentAgent = agents.find(a => a.id === 'cortex') || agents[0]; // Use Cortex agent
      setTypingAgent(currentAgent);
      
      setTimeout(() => {
        const response: Message = {
          id: (Date.now() + 1).toString(),
          content: `AI providers are not configured yet. Please configure your AI provider in settings to enable real AI responses.`,
          sender: currentAgent,
          timestamp: new Date(),
          type: 'text'
        };
        
        setMessages(prev => [...prev, response]);
        setIsTyping(false);
        setTypingAgent(null);
      }, 2000);
      return;
    }

    // Use AI provider for real responses
    setIsTyping(true);
    const currentAgent = agents.find(a => a.id === 'cortex') || agents[0]; // Use Cortex agent
    setTypingAgent(currentAgent);

    try {
      // Get the prompt for the current agent
      const promptManager = getPromptManager();
      const agentPrompt = await promptManager.getPrompt(currentAgent.id);

      // Create streaming response
      const streamingMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: '',
        sender: currentAgent,
        timestamp: new Date(),
        type: 'text',
        providerId: currentProviderId,
        modelId: currentModelId,
        isStreaming: true
      };

      setMessages(prev => [...prev, streamingMessage]);

      // Stream the response
      const generator = chatService.sendMessageStream(currentInput, {
        providerId: currentProviderId,
        modelId: currentModelId,
        agentId: currentAgent.id,
        systemPrompt: agentPrompt
      });

      let fullContent = '';
      for await (const chunk of generator) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessage.id 
              ? { ...msg, content: fullContent }
              : msg
          ));
        }

        if (chunk.isComplete) {
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessage.id 
              ? { ...msg, isStreaming: false }
              : msg
          ));
          setIsTyping(false);
          setTypingAgent(null);
          
          if (chunk.error) {
            setMessages(prev => prev.map(msg => 
              msg.id === streamingMessage.id 
                ? { ...msg, content: `Error: ${chunk.error}. Please check your AI provider configuration.` }
                : msg
            ));
          }
          break;
        }
      }
    } catch (error) {
      console.error('AI response error:', error);
      setIsTyping(false);
      setTypingAgent(null);
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: `Sorry, I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your AI provider configuration.`,
        sender: currentAgent,
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
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scroll-smooth">
        {messages.map((message) => (
          <div key={message.id} className={`${message.sender === 'user' ? 'flex space-x-3 justify-end' : 'w-full'}`}>
            {message.sender === 'user' ? (
              // User messages - keep existing style with max width
              <>
                <div className="max-w-2xl bg-blue-600 rounded-lg p-4">
                  <p className="text-white text-sm leading-relaxed">{message.content}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              </>
            ) : (
              // Agent messages - use full width
              <div className="w-full bg-gray-700 rounded-lg p-4">
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
                  <div className="flex items-center space-x-2">
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
        {/* Small Typing Indicator */}
        {isTyping && typingAgent && (
          <div className="mb-3 flex items-center space-x-2 text-xs text-gray-400">
            {(() => {
              const avatar = getAgentAvatar(typingAgent);
              return avatar ? (
                <img 
                  src={avatar} 
                  alt={typingAgent.name}
                  className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                  style={{ border: `1px solid ${getAgentColorHex(typingAgent)}` }}
                />
              ) : (
                <div 
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: getAgentColorHex(typingAgent) }}
                >
                  {React.createElement(typingAgent.icon, { className: "w-2.5 h-2.5 text-white" })}
                </div>
              );
            })()}
            <span style={{ color: getAgentColorHex(typingAgent) }}>
              {typingAgent.name} is typing
            </span>
            <div className="flex space-x-0.5">
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSend} className="flex space-x-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Describe what you want to build..."
            className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
        
        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            Cortex will guide the conversation and provide strategic insights.
          </div>
          <div className="flex items-center space-x-2">
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