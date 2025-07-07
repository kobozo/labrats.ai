import React, { useState, useEffect } from 'react';
import { agents as allAgents, Agent } from '../../config/agents';
import { AIProviderConfig, AIModel } from '../../types/ai-provider';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { ChevronDown } from 'lucide-react';
import { ProviderModelSelector } from './ProviderModelSelector';
import { ColorPicker } from './ColorPicker';

interface AgentConfig {
  provider: string;
  model: string;
  colorAccent?: string;
}

const agents = [...allAgents].sort((a, b) => a.name.localeCompare(b.name));

export const AgentSettings: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<{ [key: string]: AgentConfig }>({});
  
  const [availableProviders, setAvailableProviders] = useState<AIProviderConfig[]>([]);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    loadInitialData();
    if (agents.length > 0) {
      setSelectedAgent(agents[0]);
    }
  }, []);
  
  useEffect(() => {
    if (selectedAgent) {
      const config = agentConfigs[selectedAgent.id] || { provider: 'inherit', model: 'inherit' };
      if (config.provider !== 'inherit') {
        loadModelsForProvider(config.provider);
      } else {
        setAvailableModels([]);
      }
    }
  }, [selectedAgent, agentConfigs]);

  // Load agent configs from config
  useEffect(() => {
    const loadConfigs = async () => {
      if (window.electronAPI?.config?.get) {
        try {
          const stored = await window.electronAPI.config.get('agents', 'overrides');
          if (stored && typeof stored === 'object') {
            setAgentConfigs(stored);
          }
        } catch (err) {
          console.error('Failed to load stored agent overrides', err);
        }
      }
    };
    loadConfigs();
  }, []);

  // Helper to persist overrides
  const persistOverrides = async (overrides: { [key: string]: AgentConfig }) => {
    try {
      if (window.electronAPI?.config?.set) {
        await window.electronAPI.config.set('agents', 'overrides', overrides);
      }
    } catch (err) {
      console.error('Failed to persist agent overrides', err);
    }
  };

  const loadInitialData = async () => {
    setLoadingProviders(true);
    try {
      const providerManager = getAIProviderManager();
      const providers = await providerManager.getAvailableProviders();
      const sorted = providers.map(p => p.config).sort((a,b)=>a.name.localeCompare(b.name));
      setAvailableProviders(sorted);
    } catch (error) {
      console.error('Failed to load AI providers', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadModelsForProvider = async (providerId: string) => {
    setLoadingModels(true);
    try {
      if (window.electronAPI?.ai) {
        const models = await window.electronAPI.ai.getModels(providerId);
        setAvailableModels(models);
      }
    } catch (error) {
      console.error(`Failed to load models for ${providerId}`, error);
      setAvailableModels([]);
    }
    setLoadingModels(false);
  };

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
  };
  
  const handleConfigChange = (agentId: string, key: keyof AgentConfig, value: string) => {
    setAgentConfigs(prev => {
      const newConfig = { ...prev[agentId] || { provider: 'inherit', model: 'inherit' }, [key]: value };
      if (key === 'provider') {
        newConfig.model = 'inherit';
      }
      const updated = { ...prev, [agentId]: newConfig };
      // Persist asynchronously (fire and forget)
      persistOverrides(updated);
      return updated;
    });
  };

  const handleColorChange = (agentId: string, color: string) => {
    handleConfigChange(agentId, 'colorAccent', color);
  };

  const getAgentColor = (agent: Agent): string => {
    const config = agentConfigs[agent.id];
    return config?.colorAccent || agent.colorAccent;
  };

  const renderAgentConfiguration = (agent: Agent) => {
    const config = agentConfigs[agent.id] || { provider: 'inherit', model: 'inherit' };

    return (
      <div className="space-y-4">
        <ProviderModelSelector
          showInherit={true}
          availableProviders={availableProviders}
          availableModels={availableModels}
          loadingProviders={loadingProviders}
          loadingModels={loadingModels}
          selectedProvider={config.provider}
          selectedModel={config.model}
          onProviderChange={(id) => handleConfigChange(agent.id, 'provider', id)}
          onModelChange={(id) => handleConfigChange(agent.id, 'model', id)}
        />
      </div>
    );
  };

  return (
    <div className="flex space-x-4">
      <div className="w-1/3">
        <h3 className="text-xl font-bold mb-4">Available Agents</h3>
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={`p-3 rounded-lg cursor-pointer ${
                selectedAgent?.id === agent.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="flex items-center space-x-3">
                {agent.avatar ? (
                  <img 
                    src={agent.avatar} 
                    alt={agent.name}
                    className="w-8 h-8 rounded-full object-cover"
                    style={{ border: `2px solid ${getAgentColor(agent)}` }}
                  />
                ) : (
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xl"
                    style={{ backgroundColor: getAgentColor(agent) }}
                  >
                    {agent.icon}
                  </div>
                )}
                <div>
                  <h4 className="font-bold">{agent.name}</h4>
                  <p className="text-sm text-gray-400">{agent.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-2/3">
        {selectedAgent ? (
          <div>
            <h3 className="text-xl font-bold mb-4">Configure {selectedAgent.name}</h3>
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="flex items-center space-x-4 mb-4">
                {selectedAgent.avatar ? (
                  <img 
                    src={selectedAgent.avatar} 
                    alt={selectedAgent.name}
                    className="w-16 h-16 rounded-full object-cover"
                    style={{ border: `3px solid ${getAgentColor(selectedAgent)}` }}
                  />
                ) : (
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center text-4xl"
                    style={{ backgroundColor: getAgentColor(selectedAgent) }}
                  >
                    {selectedAgent.icon}
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="text-2xl font-bold">{selectedAgent.name}</h4>
                  <p className="text-lg text-gray-400">{selectedAgent.title}</p>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <span className="text-sm text-gray-400">Color</span>
                  <ColorPicker
                    currentColor={getAgentColor(selectedAgent)}
                    onChange={(color) => handleColorChange(selectedAgent.id, color)}
                  />
                </div>
              </div>
              
              <div>
                <h5 className="font-bold mb-2">Configuration</h5>
                {renderAgentConfiguration(selectedAgent)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Select an agent to configure</p>
          </div>
        )}
      </div>
    </div>
  );
}; 