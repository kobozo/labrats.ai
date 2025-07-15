import React, { useState, useEffect } from 'react';
import { agents as allAgents, Agent } from '../../config/agents';
import { AIProviderConfig, AIModel, AIModelType } from '../../types/ai-provider';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { ChevronDown, Bot } from 'lucide-react';
import { ProviderModelSelector } from './ProviderModelSelector';
import { ColorPicker } from './ColorPicker';

declare global {
  interface Window {
    labRatsProviderModels?: { [providerId: string]: AIModel[] };
  }
}

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
  const [defaultAvailableModels, setDefaultAvailableModels] = useState<AIModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<AIModel[]>([]);
  
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingDefaultModels, setLoadingDefaultModels] = useState(false);
  const [loadingEmbeddingModels, setLoadingEmbeddingModels] = useState(false);
  
  const [defaultProvider, setDefaultProvider] = useState<string>('');
  const [defaultModel, setDefaultModel] = useState<string>('');

  useEffect(() => {
    loadInitialData();
    loadDefaultSettings();
    if (agents.length > 0) {
      setSelectedAgent(agents[0]);
    }
  }, []);
  
  useEffect(() => {
    if (selectedAgent) {
      const config = agentConfigs[selectedAgent.id] || { provider: 'inherit', model: 'inherit' };
      if (config.provider !== 'inherit') {
        // For Dexy, load embedding models; for others, load regular models
        if (selectedAgent.id === 'dexy') {
          loadEmbeddingModelsForProvider(config.provider);
        } else {
          loadModelsForProvider(config.provider);
        }
      } else {
        setAvailableModels([]);
        setEmbeddingModels([]);
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
  
  // Watch for default provider changes to load models
  useEffect(() => {
    if (defaultProvider) {
      loadDefaultModelsForProvider(defaultProvider);
    }
  }, [defaultProvider]);
  
  // Load models from providers on mount
  useEffect(() => {
    const loadModelsFromProviders = async () => {
      try {
        const providerManager = getAIProviderManager();
        const providers = await providerManager.getAvailableProviders();
        
        // Clear any existing cached models
        window.labRatsProviderModels = {};
        
        // Load models for each provider
        for (const provider of providers) {
          try {
            const models = await provider.getModels();
            window.labRatsProviderModels = window.labRatsProviderModels || {};
            window.labRatsProviderModels[provider.id] = models;
          } catch (error) {
            console.error(`Error loading models for ${provider.id}:`, error);
          }
        }
      } catch (error) {
        console.error('Failed to load models from providers:', error);
      }
    };
    
    loadModelsFromProviders();
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
      
      // Sort providers and extract configs
      const sorted = providers.map(p => p.config).sort((a,b)=>a.name.localeCompare(b.name));
      setAvailableProviders(sorted);
      
      // Load models for each provider
      for (const provider of providers) {
        try {
          const models = await provider.getModels();
          // Store models by provider ID for later use
          window.labRatsProviderModels = window.labRatsProviderModels || {};
          window.labRatsProviderModels[provider.id] = models;
        } catch (error) {
          console.error(`Error loading models for ${provider.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load AI providers', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadModelsForProvider = async (providerId: string) => {
    setLoadingModels(true);
    try {
      let models: AIModel[] = [];
      
      // Try to get models from the provider directly
      const providerManager = getAIProviderManager();
      const provider = providerManager.getProvider(providerId);
      
      if (provider) {
        try {
          models = await provider.getModels();
          // Cache the models
          window.labRatsProviderModels = window.labRatsProviderModels || {};
          window.labRatsProviderModels[providerId] = models;
        } catch (error) {
          console.error(`Error fetching models from provider ${providerId}:`, error);
          // Try cached models as fallback
          if (window.labRatsProviderModels && window.labRatsProviderModels[providerId]) {
            models = window.labRatsProviderModels[providerId];
          }
        }
      } else if (window.labRatsProviderModels && window.labRatsProviderModels[providerId]) {
        // Use cached models if provider not available
        models = window.labRatsProviderModels[providerId];
      } else if (window.electronAPI?.ai) {
        // Last resort - try electron API
        models = await window.electronAPI.ai.getModels(providerId);
      }
      
      // Show all models (providers already filter to show only reasoning and completion models)
      setAvailableModels(models);
    } catch (error) {
      console.error(`Failed to load models for ${providerId}`, error);
      setAvailableModels([]);
    }
    setLoadingModels(false);
  };
  
  const loadEmbeddingModelsForProvider = async (providerId: string) => {
    setLoadingEmbeddingModels(true);
    try {
      let allModels: AIModel[] = [];
      
      // Try to get ALL models from the provider directly (including embedding)
      const providerManager = getAIProviderManager();
      const provider = providerManager.getProvider(providerId);
      
      if (provider) {
        try {
          // Use getAllModels if available, otherwise fallback to hardcoded list
          if (provider.getAllModels) {
            allModels = await provider.getAllModels(true);
          } else {
            // Fallback for providers that don't implement getAllModels
            if (providerId === 'openai') {
              // OpenAI embedding models
              allModels = [
                { 
                  id: 'text-embedding-3-small', 
                  name: 'Text Embedding 3 Small', 
                  description: 'Most capable embedding model for semantic search and similarity',
                  type: 'embedding' as AIModelType, 
                  contextWindow: 8192, 
                  maxTokens: 0,
                  inputCost: 0.00002,
                  outputCost: 0,
                  features: { streaming: false, functionCalling: false, vision: false, codeGeneration: false } 
                },
                { 
                  id: 'text-embedding-3-large', 
                  name: 'Text Embedding 3 Large', 
                  description: 'Large embedding model with higher dimensions for better accuracy',
                  type: 'embedding' as AIModelType, 
                  contextWindow: 8192, 
                  maxTokens: 0,
                  inputCost: 0.00013,
                  outputCost: 0,
                  features: { streaming: false, functionCalling: false, vision: false, codeGeneration: false } 
                },
                { 
                  id: 'text-embedding-ada-002', 
                  name: 'Text Embedding Ada 002', 
                  description: 'Previous generation embedding model',
                  type: 'embedding' as AIModelType, 
                  contextWindow: 8192, 
                  maxTokens: 0,
                  inputCost: 0.00010,
                  outputCost: 0,
                  features: { streaming: false, functionCalling: false, vision: false, codeGeneration: false } 
                }
              ];
            }
          }
        } catch (error) {
          console.error(`Error fetching embedding models from provider ${providerId}:`, error);
        }
      }
      
      // Filter to show only embedding models
      const embeddingModels = allModels.filter(model => model.type === 'embedding');
      setEmbeddingModels(embeddingModels);
    } catch (error) {
      console.error(`Failed to load embedding models for ${providerId}`, error);
      setEmbeddingModels([]);
    }
    setLoadingEmbeddingModels(false);
  };
  
  const loadDefaultSettings = async () => {
    if (window.electronAPI?.config?.get) {
      try {
        const provider = await window.electronAPI.config.get('agents', 'defaultProvider');
        const model = await window.electronAPI.config.get('agents', 'defaultModel');
        if (provider) setDefaultProvider(provider);
        if (model) setDefaultModel(model);
      } catch (error) {
        console.error('Failed to load default settings', error);
      }
    }
  };
  
  const loadDefaultModelsForProvider = async (providerId: string) => {
    setLoadingDefaultModels(true);
    try {
      let models: AIModel[] = [];
      
      // Try to get models from the provider directly
      const providerManager = getAIProviderManager();
      const provider = providerManager.getProvider(providerId);
      
      if (provider) {
        try {
          models = await provider.getModels();
          // Cache the models
          window.labRatsProviderModels = window.labRatsProviderModels || {};
          window.labRatsProviderModels[providerId] = models;
        } catch (error) {
          console.error(`Error fetching models from provider ${providerId}:`, error);
          // Try cached models as fallback
          if (window.labRatsProviderModels && window.labRatsProviderModels[providerId]) {
            models = window.labRatsProviderModels[providerId];
          }
        }
      } else if (window.labRatsProviderModels && window.labRatsProviderModels[providerId]) {
        // Use cached models if provider not available
        models = window.labRatsProviderModels[providerId];
      } else if (window.electronAPI?.ai) {
        // Last resort - try electron API
        models = await window.electronAPI.ai.getModels(providerId);
      }
      
      // Show all models (providers already filter to show only reasoning and completion models)
      setDefaultAvailableModels(models);
    } catch (error) {
      console.error(`Failed to load models for ${providerId}`, error);
      setDefaultAvailableModels([]);
    }
    setLoadingDefaultModels(false);
  };
  
  const handleDefaultProviderChange = async (providerId: string) => {
    setDefaultProvider(providerId);
    setDefaultModel(''); // Reset model when provider changes
    
    // Save to config
    if (window.electronAPI?.config?.set) {
      await window.electronAPI.config.set('agents', 'defaultProvider', providerId);
    }
  };
  
  const handleDefaultModelChange = async (modelId: string) => {
    setDefaultModel(modelId);
    
    // Save to config
    if (window.electronAPI?.config?.set) {
      await window.electronAPI.config.set('agents', 'defaultModel', modelId);
    }
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
    // Special case for Switchy - only color configuration allowed
    if (agent.id === 'switchy') {
      return (
        <div className="space-y-4">
          <div className="bg-gray-700 p-4 rounded-lg">
            <h6 className="font-medium text-yellow-400 mb-2">🔄 Single-Agent Assistant</h6>
            <p className="text-sm text-gray-300 mb-4">
              Switchy is a special agent that operates independently when the LabRats.AI backend is unavailable. 
              Unlike other agents, Switchy assumes all roles and capabilities:
            </p>
            <ul className="text-sm text-gray-300 space-y-1 mb-4">
              <li>🎯 <strong>Product Strategy</strong> - Requirements, user stories, roadmaps</li>
              <li>💾 <strong>Backend Development</strong> - APIs, databases, server logic</li>
              <li>🎨 <strong>Frontend Development</strong> - UI/UX, components, styling</li>
              <li>🔍 <strong>Quality Assurance</strong> - Testing strategies, bug fixes</li>
              <li>🔒 <strong>Security</strong> - Vulnerability analysis, best practices</li>
              <li>⚙️ <strong>DevOps</strong> - Deployment, infrastructure, CI/CD</li>
              <li>🏗️ <strong>Architecture</strong> - System design, scalability</li>
              <li>📝 <strong>Documentation</strong> - Guides, specs, explanations</li>
            </ul>
            <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded">
              <strong>When is Switchy used?</strong><br />
              Switchy automatically activates when the LabRats.AI backend is unavailable. 
              All provider and model settings are inherited from your global AI configuration. 
              Only the color accent can be customized.
            </div>
          </div>
        </div>
      );
    }

    // Special case for Dexy - requires embedding models
    if (agent.id === 'dexy') {
      const config = agentConfigs[agent.id] || { provider: 'inherit', model: 'inherit' };
      
      return (
        <div className="space-y-4">
          <div className="bg-yellow-900/20 border border-yellow-600/50 p-4 rounded-lg mb-4">
            <h6 className="font-medium text-yellow-400 mb-2">🗄️ Vectorization Agent</h6>
            <p className="text-sm text-gray-300">
              Dexy requires an embedding model to create vector representations of your content. 
              Embedding models are specialized for converting text into numerical vectors for semantic search and similarity matching.
            </p>
          </div>
          <ProviderModelSelector
            showInherit={false}
            availableProviders={availableProviders}
            availableModels={embeddingModels}
            loadingProviders={loadingProviders}
            loadingModels={loadingEmbeddingModels}
            selectedProvider={config.provider === 'inherit' ? '' : config.provider}
            selectedModel={config.model === 'inherit' ? '' : config.model}
            onProviderChange={(id) => handleConfigChange(agent.id, 'provider', id)}
            onModelChange={(id) => handleConfigChange(agent.id, 'model', id)}
          />
          {config.provider === 'inherit' && (
            <div className="text-sm text-red-400 mt-2">
              ⚠️ No embedding model configured. Dexy cannot function without an embedding model.
            </div>
          )}
        </div>
      );
    }

    // Regular agent configuration
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
    <div className="space-y-6">
      {/* Default AI Model Selection */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Bot className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-bold">Default AI Model</h3>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Select the default AI provider and model that all agents will use unless overridden.
        </p>
        <ProviderModelSelector
          showInherit={false}
          availableProviders={availableProviders}
          availableModels={defaultAvailableModels}
          loadingProviders={loadingProviders}
          loadingModels={loadingDefaultModels}
          selectedProvider={defaultProvider}
          selectedModel={defaultModel}
          onProviderChange={handleDefaultProviderChange}
          onModelChange={handleDefaultModelChange}
        />
        
        {/* Selected Model Info */}
        {defaultProvider && defaultModel && (() => {
          const selectedModelInfo = defaultAvailableModels.find(m => m.id === defaultModel);
          if (!selectedModelInfo) return null;
          
          return (
            <div className="mt-4 p-4 bg-gray-700 rounded-lg">
              <h4 className="text-white font-medium mb-2">{selectedModelInfo.name}</h4>
              {selectedModelInfo.description && (
                <p className="text-gray-400 text-sm mb-3">{selectedModelInfo.description}</p>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-400">
                <div>
                  <span className="text-gray-300 font-medium">Context Window:</span>
                  <span className="ml-1">{selectedModelInfo.contextWindow.toLocaleString()} tokens</span>
                </div>
                <div>
                  <span className="text-gray-300 font-medium">Max Tokens:</span>
                  <span className="ml-1">{selectedModelInfo.maxTokens.toLocaleString()}</span>
                </div>
                {selectedModelInfo.inputCost && selectedModelInfo.outputCost && (
                  <div>
                    <span className="text-gray-300 font-medium">Cost:</span>
                    <span className="ml-1">${selectedModelInfo.inputCost}/${selectedModelInfo.outputCost} per 1K</span>
                  </div>
                )}
              </div>
              
              {/* Features */}
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedModelInfo.features.streaming && (
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                    Streaming
                  </span>
                )}
                {selectedModelInfo.features.functionCalling && (
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                    Function Calling
                  </span>
                )}
                {selectedModelInfo.features.vision && (
                  <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded">
                    Vision
                  </span>
                )}
                {selectedModelInfo.features.codeGeneration && (
                  <span className="px-2 py-1 bg-orange-600 text-white text-xs rounded">
                    Code Generation
                  </span>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      
      {/* Agent Configuration */}
      <div className="flex space-x-4" style={{ height: '60vh' }}>
        {/* Agent List Column - Independent Scrolling */}
        <div className="w-1/3 flex flex-col" style={{ height: '60vh' }}>
        <h3 className="text-xl font-bold mb-4 flex-shrink-0">Available Agents</h3>
        <div 
          className="flex-1 overflow-y-auto space-y-2 pr-2 border border-gray-700 rounded-lg bg-gray-800 p-3"
          style={{ 
            height: 'calc(60vh - 4rem)',
            scrollbarWidth: 'thin',
            scrollbarColor: '#4B5563 #1F2937'
          }}
        >
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={`p-3 rounded-lg cursor-pointer flex-shrink-0 transition-colors ${
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold truncate">{agent.name}</h4>
                    {agent.id === 'dexy' && (agentConfigs[agent.id]?.provider === 'inherit' || !agentConfigs[agent.id]?.provider) && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="No embedding model configured" />
                    )}
                  </div>
                  <p className="text-sm text-gray-400 truncate">{agent.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-tight line-clamp-2">{agent.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
        
        {/* Settings Panel Column - Independent Scrolling */}
        <div className="w-2/3 flex flex-col" style={{ height: '60vh' }}>
        {selectedAgent ? (
          <>
            <h3 className="text-xl font-bold mb-4 flex-shrink-0">Configure {selectedAgent.name}</h3>
            <div 
              className="flex-1 overflow-y-auto border border-gray-700 rounded-lg bg-gray-800"
              style={{ 
                height: 'calc(60vh - 4rem)',
                scrollbarWidth: 'thin',
                scrollbarColor: '#4B5563 #1F2937'
              }}
            >
              <div className="p-4">
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
                    <p className="text-sm text-gray-300 mt-2 italic">{selectedAgent.description}</p>
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
          </>
        ) : (
          <div className="flex items-center justify-center border border-gray-700 rounded-lg bg-gray-800" style={{ height: 'calc(60vh - 4rem)' }}>
            <p className="text-gray-500">Select an agent to configure</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}; 