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
  Brain
} from 'lucide-react';

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
}

interface ChatProps {
  onCodeReview: (changes: any) => void;
}

const agents: Agent[] = [
  {
    id: 'team-leader',
    name: 'Team Leader',
    role: 'Orchestrator',
    color: 'blue',
    icon: Crown,
    isActive: true,
    specialization: ['project-management', 'architecture', 'coordination']
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    role: 'Critical Thinker',
    color: 'red', 
    icon: AlertTriangle,
    isActive: true,
    specialization: ['code-review', 'debugging', 'optimization']
  },
  {
    id: 'chaos-monkey',
    name: 'Chaos Monkey',
    role: 'Stress Tester',
    color: 'orange',
    icon: Zap,
    isActive: true,
    specialization: ['testing', 'edge-cases', 'reliability']
  },
  {
    id: 'backend-dev',
    name: 'Backend Dev',
    role: 'Server Specialist',
    color: 'green',
    icon: Database,
    isActive: false,
    specialization: ['apis', 'databases', 'server-logic']
  },
  {
    id: 'frontend-dev',
    name: 'Frontend Dev',
    role: 'UI/UX Expert',
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
  }
];

const mockMessages: Message[] = [
  {
    id: '1',
    content: 'Welcome to the LabRats AI IDE! I\'m analyzing your project requirements. Based on your request for an AI-first IDE, I\'m bringing in our core team: Contrarian for critical review and Chaos Monkey for stress testing.',
    sender: agents[0],
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
    type: 'text'
  },
  {
    id: '2', 
    content: 'I see potential issues with the current architecture. We need to consider edge cases for multi-agent coordination. What happens when agents disagree on implementation?',
    sender: agents[1],
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
    type: 'text'
  },
  {
    id: '3',
    content: 'Let me stress test this! What if we have 100 concurrent chat sessions? Network failures? Memory leaks? I\'m adding chaos scenarios to our test suite.',
    sender: agents[2],
    timestamp: new Date(Date.now() - 6 * 60 * 1000),
    type: 'text'
  },
  {
    id: '4',
    content: 'I need to create a sophisticated chat interface with multi-agent support, automated code reviews, and git integration.',
    sender: 'user',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    type: 'text'
  },
  {
    id: '5',
    content: 'Perfect! I\'m bringing in our Frontend Dev for UI expertise. This requires complex state management, real-time updates, and beautiful interactions.',
    sender: agents[0],
    timestamp: new Date(Date.now() - 3 * 60 * 1000),
    type: 'text'
  }
];

export const Chat: React.FC<ChatProps> = ({ onCodeReview }) => {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [inputValue, setInputValue] = useState('');
  const [activeAgents, setActiveAgents] = useState(agents.filter(a => a.isActive));
  const [isTyping, setIsTyping] = useState(false);
  const [typingAgent, setTypingAgent] = useState<Agent | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    setInputValue('');
    
    // Simulate agent responses
    setIsTyping(true);
    
    setTimeout(() => {
      const teamLeader = agents[0];
      setTypingAgent(teamLeader);
      
      setTimeout(() => {
        const response: Message = {
          id: (Date.now() + 1).toString(),
          content: `I understand your request. Let me analyze the requirements and determine which specialists we need for this task. I'm thinking we'll need our Frontend Dev for the UI components.`,
          sender: teamLeader,
          timestamp: new Date(),
          type: 'text'
        };
        
        setMessages(prev => [...prev, response]);
        setIsTyping(false);
        setTypingAgent(null);
        
        // Simulate adding a new agent to the conversation
        setTimeout(() => {
          if (!activeAgents.find(a => a.id === 'frontend-dev')) {
            const frontendDev = agents.find(a => a.id === 'frontend-dev')!;
            setActiveAgents(prev => [...prev, frontendDev]);
            
            setTimeout(() => {
              const frontendResponse: Message = {
                id: (Date.now() + 2).toString(),
                content: `Great to be here! I'm reviewing the UI requirements. We'll need responsive design, smooth animations, and excellent accessibility. I suggest we implement a component-based architecture with proper state management.`,
                sender: frontendDev,
                timestamp: new Date(),
                type: 'text'
              };
              setMessages(prev => [...prev, frontendResponse]);
            }, 1500);
          }
        }, 1000);
      }, 2000);
    }, 1000);
    
    // Trigger code review workflow after certain messages
    if (inputValue.toLowerCase().includes('implement') || inputValue.toLowerCase().includes('code')) {
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
      indigo: 'bg-indigo-500'
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
      indigo: 'text-indigo-400'
    };
    return colors[agent.color as keyof typeof colors] || 'text-gray-400';
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
        
        <div ref={messagesEndRef} />
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
        
        <div className="mt-2 text-xs text-gray-400">
          Team Leader will orchestrate the response and add specialized agents as needed.
        </div>
      </div>
    </div>
  );
};