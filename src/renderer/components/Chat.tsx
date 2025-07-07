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
import { getLangChainChatService } from '../../services/langchain-chat-service';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { getPromptManager } from '../../services/prompt-manager';

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
}

const agents: Agent[] = [
  {
    id: 'product-owner',
    name: 'Cortex',
    role: 'Product Owner',
    color: 'teal',
    icon: Target,
    isActive: true,
    specialization: ['product-strategy', 'requirements', 'user-research']
  },
  {
    id: 'team-leader',
    name: 'Team Leader',
    role: 'Orchestrator',
    color: 'blue',
    icon: Crown,
    isActive: false,
    specialization: ['project-management', 'architecture', 'coordination']
  },
  {
    id: 'contrarian',
    name: 'Scratchy',
    role: 'Contrarian Analyst',
    color: 'red', 
    icon: AlertTriangle,
    isActive: false,
    specialization: ['code-review', 'debugging', 'optimization']
  },
  {
    id: 'chaos-monkey',
    name: 'Ziggy',
    role: 'Chaos Monkey',
    color: 'orange',
    icon: Zap,
    isActive: false,
    specialization: ['testing', 'edge-cases', 'reliability']
  },
  {
    id: 'backend-dev',
    name: 'Patchy',
    role: 'Backend Developer',
    color: 'green',
    icon: Database,
    isActive: false,
    specialization: ['apis', 'databases', 'server-logic']
  },
  {
    id: 'frontend-dev',
    name: 'Shiny',
    role: 'Frontend Developer',
    color: 'purple',
    icon: Palette,
    isActive: false,
    specialization: ['ui', 'ux', 'responsive-design']
  },
  {
    id: 'fullstack-dev',
    name: 'Fullstack Dev',
    role: 'Full Stack Engineer',
    color: 'indigo',
    icon: Code,
    isActive: false,
    specialization: ['frontend', 'backend', 'integration']
  },
  {
    id: 'quality-engineer',
    name: 'Sniffy',
    role: 'Quality Engineer',
    color: 'gray',
    icon: Search,
    isActive: false,
    specialization: ['testing', 'quality-assurance', 'test-automation']
  },
  {
    id: 'security-auditor',
    name: 'Trappy',
    role: 'Security Auditor',
    color: 'slate',
    icon: Shield,
    isActive: false,
    specialization: ['security', 'vulnerability-assessment', 'compliance']
  },
  {
    id: 'devops',
    name: 'Wheelie',
    role: 'Platform/DevOps',
    color: 'cyan',
    icon: Server,
    isActive: false,
    specialization: ['infrastructure', 'ci-cd', 'automation']
  },
  {
    id: 'code-reviewer',
    name: 'Clawsy',
    role: 'Code Reviewer',
    color: 'rose',
    icon: Edit,
    isActive: false,
    specialization: ['code-quality', 'standards', 'best-practices']
  },
  {
    id: 'architect',
    name: 'Nestor',
    role: 'Architect',
    color: 'violet',
    icon: Building,
    isActive: false,
    specialization: ['system-design', 'architecture', 'technical-leadership']
  },
  {
    id: 'document-writer',
    name: 'Quill',
    role: 'Document Writer',
    color: 'amber',
    icon: FileText,
    isActive: false,
    specialization: ['documentation', 'technical-writing', 'guides']
  }
];

export const Chat: React.FC<ChatProps> = ({ onCodeReview }) => {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatService = getLangChainChatService();
  const providerManager = getAIProviderManager();

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
  }, []);

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
      const currentAgent = agents[0]; // Product Owner
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
    const currentAgent = agents[0]; // Product Owner is now the first agent
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
            {activeAgents.map((agent) => (
              <div key={agent.id} className="flex items-center space-x-2 px-3 py-1 bg-gray-700 rounded-full">
                <div className={`w-2 h-2 rounded-full ${getAgentColor(agent)}`}></div>
                <agent.icon className="w-4 h-4 text-gray-300" />
                <span className="text-xs text-gray-300">{agent.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scroll-smooth">
        {messages.map((message) => (
          <div key={message.id} className={`flex space-x-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.sender !== 'user' && (
              <div className={`w-8 h-8 rounded-full ${getAgentColor(message.sender as Agent)} flex items-center justify-center`}>
                {React.createElement((message.sender as Agent).icon, { className: "w-4 h-4 text-white" })}
              </div>
            )}
            
            <div className={`max-w-2xl ${message.sender === 'user' ? 'bg-blue-600' : 'bg-gray-700'} rounded-lg p-4`}>
              {message.sender !== 'user' && (
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`font-medium ${getAgentTextColor(message.sender as Agent)}`}>
                    {(message.sender as Agent).name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              )}
              
              <p className="text-white text-sm leading-relaxed">{message.content}</p>
              
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
            
            {message.sender === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        
        {/* Typing Indicator */}
        {isTyping && typingAgent && (
          <div className="flex space-x-3">
            <div className={`w-8 h-8 rounded-full ${getAgentColor(typingAgent)} flex items-center justify-center`}>
              {React.createElement(typingAgent.icon, { className: "w-4 h-4 text-white" })}
            </div>
            <div className="bg-gray-700 rounded-lg p-4 max-w-xs">
              <div className="flex items-center space-x-2 mb-2">
                <span className={`font-medium ${getAgentTextColor(typingAgent)}`}>
                  {typingAgent.name}
                </span>
                <Brain className="w-4 h-4 text-blue-400 animate-pulse" />
              </div>
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 flex-shrink-0">
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