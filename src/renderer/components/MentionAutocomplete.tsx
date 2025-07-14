import React, { useState, useEffect, useRef } from 'react';
import { agents } from '../../config/agents';

interface MentionAutocompleteProps {
  inputValue: string;
  onSelect: (mention: string) => void;
  onClose: () => void;
  cursorPosition: number;
  singleAgentMode?: boolean;
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  inputValue,
  onSelect,
  onClose,
  cursorPosition,
  singleAgentMode = false
}) => {
  const [filteredAgents, setFilteredAgents] = useState<typeof agents>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionTrigger, setMentionTrigger] = useState<{ start: number; query: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find the last @ symbol before cursor position
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex === -1) {
      setMentionTrigger(null);
      return;
    }

    // Check if there's a space after the @ (which would break the mention)
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
    if (textAfterAt.includes(' ')) {
      setMentionTrigger(null);
      return;
    }

    // Extract the query after @
    const query = textAfterAt.toLowerCase();
    
    // Filter agents based on query and mention restrictions
    const filtered = agents.filter(agent => {
      // Filter by query
      const matchesQuery = agent.id.toLowerCase().includes(query) || 
        agent.name.toLowerCase().includes(query);
      
      if (!matchesQuery) return false;
      
      // Apply mention restrictions
      if (singleAgentMode) {
        // In single mode, only show agents with singleMode: true
        return agent.singleMode === true;
      } else {
        // In multi mode, exclude agents with mentionInChat: false
        return agent.mentionInChat !== false;
      }
    });

    if (filtered.length > 0) {
      setMentionTrigger({ start: lastAtIndex, query });
      setFilteredAgents(filtered);
      setSelectedIndex(0);
    } else {
      setMentionTrigger(null);
    }
  }, [inputValue, cursorPosition]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mentionTrigger || filteredAgents.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredAgents.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredAgents.length) % filteredAgents.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          handleSelect(filteredAgents[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mentionTrigger, filteredAgents, selectedIndex]);

  const handleSelect = (agent: typeof agents[0]) => {
    if (!mentionTrigger) return;
    
    const beforeMention = inputValue.substring(0, mentionTrigger.start);
    const afterMention = inputValue.substring(cursorPosition);
    const newValue = beforeMention + `@${agent.id} ` + afterMention;
    
    onSelect(newValue);
    onClose();
  };

  if (!mentionTrigger || filteredAgents.length === 0) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
      style={{ minWidth: '200px' }}
    >
      <div className="px-3 py-2 text-xs text-gray-400 font-medium border-b border-gray-600">
        Mention an agent
      </div>
      {filteredAgents.map((agent, index) => (
        <div
          key={agent.id}
          className={`px-3 py-2 cursor-pointer flex items-center space-x-3 hover:bg-gray-700 ${
            index === selectedIndex ? 'bg-gray-700' : ''
          }`}
          onClick={() => handleSelect(agent)}
        >
          {agent.avatar ? (
            <img
              src={agent.avatar}
              alt={agent.name}
              className="w-6 h-6 rounded-full object-cover"
              style={{ border: `2px solid ${agent.colorAccent}` }}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: agent.colorAccent }}
            >
              {agent.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              @{agent.id}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {agent.name} • {agent.title}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};