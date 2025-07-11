import React, { useState, useEffect, useRef } from 'react';
import { MultiAgentChatService, MultiAgentChatMessage } from '../../services/multi-agent-chat-service';
import { agents } from '../../config/agents';

interface MultiAgentChatProps {
  initialGoal?: string;
  onConversationEnd?: (data: any) => void;
  className?: string;
}

export const MultiAgentChat: React.FC<MultiAgentChatProps> = ({
  initialGoal = 'Complete the assigned task',
  onConversationEnd,
  className = ''
}) => {
  const [chatService] = useState(() => {
    try {
      return new MultiAgentChatService({ initialGoal });
    } catch (error) {
      console.error('[MULTI-AGENT-UI] Error creating chat service:', error);
      // Return a mock service if creation fails
      return new MultiAgentChatService({ initialGoal });
    }
  });
  const [messages, setMessages] = useState<MultiAgentChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMessage = (message: MultiAgentChatMessage) => {
      console.log(`[MULTI-AGENT-UI] Received message:`, {
        id: message.id,
        author: message.author,
        role: message.role,
        contentPreview: message.content.substring(0, 100),
        isSystem: message.isSystem
      });
      setMessages(prev => [...prev, message]);
    };

    const handleConversationEnded = (data: any) => {
      setIsActive(false);
      onConversationEnd?.(data);
    };

    const handleConversationReset = () => {
      setMessages([]);
      setIsActive(false);
      setActiveAgents([]);
    };

    const handleQuickInvite = (event: CustomEvent) => {
      setInputMessage(event.detail);
    };

    chatService.on('message', handleMessage);
    chatService.on('conversation-ended', handleConversationEnded);
    chatService.on('conversation-reset', handleConversationReset);
    window.addEventListener('quickInvite', handleQuickInvite as EventListener);

    return () => {
      chatService.off('message', handleMessage);
      chatService.off('conversation-ended', handleConversationEnded);
      chatService.off('conversation-reset', handleConversationReset);
      window.removeEventListener('quickInvite', handleQuickInvite as EventListener);
    };
  }, [chatService, onConversationEnd]);

  useEffect(() => {
    // Update active agents when messages change
    setActiveAgents(chatService.activeAgents);
  }, [messages, chatService]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartConversation = async () => {
    if (!inputMessage.trim()) return;
    
    setIsLoading(true);
    try {
      await chatService.startConversation(inputMessage);
      setIsActive(true);
      setInputMessage('');
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
    setIsLoading(false);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !isActive) return;
    
    const messageToSend = inputMessage;
    setInputMessage(''); // Clear input immediately so user can type next message
    
    try {
      await chatService.sendMessage(messageToSend);
    } catch (error) {
      console.error('Error sending message:', error);
      // Optionally restore the message on error
      setInputMessage(messageToSend);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isActive) {
        handleSendMessage();
      } else {
        handleStartConversation();
      }
    }
  };

  const getAgentInfo = (agentId: string) => {
    if (agentId === 'user') return { name: 'You', title: 'User', colorAccent: '#3B82F6' };
    if (agentId === 'system') return { name: 'System', title: 'System', colorAccent: '#6B7280' };
    
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      return agent;
    }
    
    console.warn(`[MULTI-AGENT-UI] Agent ${agentId} not found in agents config`);
    return { name: agentId, title: 'Unknown', colorAccent: '#6B7280' };
  };

  const renderMessage = (message: MultiAgentChatMessage, index: number) => {
    const agent = getAgentInfo(message.author);
    const isUser = message.author === 'user';
    const isSystem = message.isSystem || message.author === 'system';
    
    return (
      <div
        key={message.id}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div
          className={`max-w-[80%] rounded-lg p-3 ${
            isUser
              ? 'bg-blue-500 text-white'
              : isSystem
              ? 'bg-gray-100 text-gray-800 border border-gray-300'
              : 'bg-white text-gray-800 border border-gray-200 shadow-sm'
          }`}
        >
          {!isUser && (
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: agent.colorAccent }}
              />
              <span className="font-medium text-sm">
                {agent.name} {agent.title && `(${agent.title})`}
              </span>
              <span className="text-xs text-gray-500">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm">
            {message.content}
          </div>
        </div>
      </div>
    );
  };

  const renderActiveAgents = () => {
    if (activeAgents.length === 0) return null;

    return (
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Active Team Members:</h4>
        <div className="flex flex-wrap gap-2">
          {activeAgents.map(agentId => {
            const agent = getAgentInfo(agentId);
            return (
              <div
                key={agentId}
                className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-gray-200 text-sm"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: agent.colorAccent }}
                />
                <span>{agent.name}</span>
              </div>
            );
          })}
        </div>
        
        {/* Quick invite buttons for common agents */}
        <div className="mt-3 pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-600 mb-2">Quick invite:</p>
          <div className="flex flex-wrap gap-1">
            {['patchy', 'shiny', 'sketchy', 'sniffy', 'trappy', 'nestor'].filter(id => !activeAgents.includes(id)).map(agentId => {
              const agent = getAgentInfo(agentId);
              return (
                <button
                  key={agentId}
                  onClick={() => {
                    const command = `@orchestrator invite ${agentId}`;
                    const event = new CustomEvent('quickInvite', { detail: command });
                    window.dispatchEvent(event);
                  }}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  title={`Invite ${agent.name} (${agent.title})`}
                >
                  +{agent.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold text-gray-800">Multi-Agent Chat</h2>
        <p className="text-sm text-gray-600">Goal: {chatService.currentGoal}</p>
        {isActive && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => chatService.getStatus()}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Status
            </button>
            <button
              onClick={() => chatService.endConversation()}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              End Conversation
            </button>
          </div>
        )}
      </div>

      {/* Active Agents */}
      {isActive && renderActiveAgents()}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(renderMessage)}
        {isLoading && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isActive ? "Type your message..." : "Enter your goal or task to start..."}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={false}
          />
          <button
            onClick={isActive ? handleSendMessage : handleStartConversation}
            disabled={!inputMessage.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActive ? 'Send' : 'Start'}
          </button>
        </div>
        
        {!isActive && (
          <div className="mt-2">
            <p className="text-xs text-gray-500">
              The Product Owner (Cortex) will automatically join and coordinate the team.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              💡 Use <code className="bg-gray-100 px-1 rounded">@orchestrator invite &lt;agent&gt;</code> to invite agents directly!
            </p>
          </div>
        )}
        
        {isActive && (
          <div className="mt-2">
            <p className="text-xs text-gray-400">
              Commands: <code className="bg-gray-100 px-1 rounded">@orchestrator invite patchy</code>, 
              <code className="bg-gray-100 px-1 rounded ml-1">@orchestrator status</code>, 
              <code className="bg-gray-100 px-1 rounded ml-1">@orchestrator end</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};