import React, { useState } from 'react';
import { MultiAgentChat } from '../components/MultiAgentChat';

export const MultiAgentChatTest: React.FC = () => {
  const [conversationResults, setConversationResults] = useState<any[]>([]);

  const handleConversationEnd = (data: any) => {
    setConversationResults(prev => [...prev, data]);
  };

  return (
    <div className="h-screen bg-gray-100">
      <div className="h-full max-w-4xl mx-auto flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-6 bg-white shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800">Multi-Agent Chat Test</h1>
          <p className="text-gray-600 mt-2">
            Test the multi-agent chat system with the LabRats AI team. Start by describing a task or goal.
          </p>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 p-6">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200">
            <MultiAgentChat 
              initialGoal="Test multi-agent collaboration"
              onConversationEnd={handleConversationEnd}
              className="h-full"
            />
          </div>
        </div>

        {/* Results Panel */}
        {conversationResults.length > 0 && (
          <div className="flex-shrink-0 p-6 bg-white border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Conversation Results</h3>
            <div className="space-y-4">
              {conversationResults.map((result, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">
                    <strong>Goal:</strong> {result.goal}
                  </div>
                  <div className="text-sm text-gray-600">
                    <strong>Members:</strong> {result.members.join(', ')}
                  </div>
                  <div className="text-sm text-gray-600">
                    <strong>Ended:</strong> {new Date(result.endTime).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};