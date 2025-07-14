import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  HardDrive,
  Search,
  Settings,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  Info
} from 'lucide-react';
import { ProviderModelSelector } from '../ProviderModelSelector';
import embeddingModels from '../../../config/models/embedding-models.json';

interface VectorStoreSettingsProps {
  settings: any;
  onSettingsChange: (newSettings: any) => void;
}

export const VectorStoreSettings: React.FC<VectorStoreSettingsProps> = ({
  settings,
  onSettingsChange
}) => {
  const [selectedStore, setSelectedStore] = useState(settings.vectorStores?.defaultStore || 'local');
  const [selectedEmbeddingProvider, setSelectedEmbeddingProvider] = useState(
    settings.vectorStores?.defaultEmbeddingProvider || 'openai'
  );
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'success' | 'error' | null>(null);

  // Available vector stores
  const vectorStores = [
    {
      id: 'local',
      name: 'Local Vector Store',
      type: 'local',
      icon: HardDrive,
      description: 'Fast, private vector search using HNSWLib',
      features: ['No API key required', 'Data stays local', 'Up to 1M vectors'],
      configurable: false
    },
    {
      id: 'pinecone',
      name: 'Pinecone',
      type: 'cloud',
      icon: Cloud,
      description: 'Scalable cloud vector database',
      features: ['Managed service', 'Real-time updates', 'Metadata filtering'],
      configurable: true,
      configFields: ['apiKey', 'environment']
    },
    {
      id: 'weaviate',
      name: 'Weaviate',
      type: 'cloud',
      icon: Cloud,
      description: 'Open-source vector search engine',
      features: ['GraphQL API', 'Hybrid search', 'Multi-tenancy'],
      configurable: true,
      configFields: ['endpoint', 'apiKey']
    },
    {
      id: 'qdrant',
      name: 'Qdrant',
      type: 'cloud',
      icon: Cloud,
      description: 'High-performance vector similarity search',
      features: ['Rust-based', 'Payload filtering', 'Distributed'],
      configurable: true,
      configFields: ['endpoint', 'apiKey']
    }
  ];

  // Embedding providers from JSON configuration
  const embeddingProviders = Object.entries(embeddingModels.models).map(([providerId, models]) => ({
    id: providerId,
    name: providerId.charAt(0).toUpperCase() + providerId.slice(1) + (providerId === 'ollama' ? ' (Local)' : ''),
    models: models as any[]
  }));

  const selectedStoreConfig = vectorStores.find(s => s.id === selectedStore);
  const selectedProviderConfig = embeddingProviders.find(p => p.id === selectedEmbeddingProvider);

  const handleStoreChange = (storeId: string) => {
    setSelectedStore(storeId);
    onSettingsChange({
      ...settings,
      vectorStores: {
        ...settings.vectorStores,
        defaultStore: storeId
      }
    });
  };

  const handleEmbeddingProviderChange = (providerId: string, modelId: string) => {
    setSelectedEmbeddingProvider(providerId);
    setSelectedEmbeddingModel(modelId);
    
    const provider = embeddingProviders.find(p => p.id === providerId);
    const model = provider?.models.find(m => m.id === modelId);
    
    onSettingsChange({
      ...settings,
      vectorStores: {
        ...settings.vectorStores,
        defaultEmbeddingProvider: providerId,
        embeddingProviders: {
          ...settings.vectorStores?.embeddingProviders,
          [providerId]: {
            provider: providerId,
            model: modelId,
            dimensions: model?.dimensions || 1536,
            enabled: true
          }
        }
      }
    });
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    
    // Simulate connection test
    setTimeout(() => {
      setTestingConnection(false);
      setConnectionStatus(selectedStore === 'local' ? 'success' : 'error');
    }, 2000);
  };

  return (
    <div className="space-y-8">
      {/* Vector Store Selection */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Vector Store Provider</h3>
        <div className="grid gap-4">
          {vectorStores.map(store => (
            <div
              key={store.id}
              className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
                selectedStore === store.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => handleStoreChange(store.id)}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${
                  selectedStore === store.id ? 'bg-blue-600' : 'bg-gray-700'
                }`}>
                  <store.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-white">{store.name}</h4>
                    {selectedStore === store.id && (
                      <Check className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{store.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {store.features.map((feature, idx) => (
                      <span key={idx} className="text-xs bg-gray-700 px-2 py-1 rounded">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Configuration for cloud providers */}
              {selectedStore === store.id && store.configurable && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="space-y-3">
                    {store.configFields?.includes('apiKey') && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">API Key</label>
                        <input
                          type="password"
                          placeholder="Enter your API key"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                        />
                      </div>
                    )}
                    {store.configFields?.includes('environment') && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Environment</label>
                        <input
                          type="text"
                          placeholder="e.g., us-east-1"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                        />
                      </div>
                    )}
                    {store.configFields?.includes('endpoint') && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Endpoint URL</label>
                        <input
                          type="text"
                          placeholder="https://your-instance.weaviate.network"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white"
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Test Connection Button */}
                  <button
                    onClick={testConnection}
                    disabled={testingConnection}
                    className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white transition-colors flex items-center space-x-2"
                  >
                    {testingConnection ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                  
                  {connectionStatus && (
                    <div className={`mt-2 text-sm flex items-center space-x-2 ${
                      connectionStatus === 'success' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {connectionStatus === 'success' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Connection successful</span>
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4" />
                          <span>Connection failed</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Embedding Model Selection */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Embedding Model</h3>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-start space-x-2 mb-4">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-400">
              The embedding model converts your text into vectors. Different models have different dimensions and capabilities.
              Choose a model that balances performance, cost, and quality for your use case.
            </p>
          </div>
          
          <div className="space-y-4">
            {embeddingProviders.map(provider => (
              <div key={provider.id} className="space-y-2">
                <div className="font-medium text-white">{provider.name}</div>
                <div className="grid gap-2">
                  {provider.models.map(model => (
                    <label
                      key={model.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedEmbeddingProvider === provider.id && selectedEmbeddingModel === model.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          name="embeddingModel"
                          checked={selectedEmbeddingProvider === provider.id && selectedEmbeddingModel === model.id}
                          onChange={() => handleEmbeddingProviderChange(provider.id, model.id)}
                          className="text-blue-600"
                        />
                        <div>
                          <div className="text-white">{model.name}</div>
                          <div className="text-xs text-gray-400">
                            {model.dimensions} dimensions
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indexing Settings */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Indexing Settings</h3>
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={settings.vectorStores?.indexing?.autoIndex || false}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  vectorStores: {
                    ...settings.vectorStores,
                    indexing: {
                      ...settings.vectorStores?.indexing,
                      autoIndex: e.target.checked
                    }
                  }
                })}
                className="rounded border-gray-600 text-blue-600"
              />
              <span className="text-white">Auto-index new projects</span>
            </label>
          </div>
          
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={settings.vectorStores?.indexing?.indexOnSave || false}
                onChange={(e) => onSettingsChange({
                  ...settings,
                  vectorStores: {
                    ...settings.vectorStores,
                    indexing: {
                      ...settings.vectorStores?.indexing,
                      indexOnSave: e.target.checked
                    }
                  }
                })}
                className="rounded border-gray-600 text-blue-600"
              />
              <span className="text-white">Update index on file save</span>
            </label>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Chunk Size (tokens)</label>
            <input
              type="number"
              value={settings.vectorStores?.indexing?.chunkSize || 512}
              onChange={(e) => onSettingsChange({
                ...settings,
                vectorStores: {
                  ...settings.vectorStores,
                  indexing: {
                    ...settings.vectorStores?.indexing,
                    chunkSize: parseInt(e.target.value)
                  }
                }
              })}
              className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Chunk Overlap (tokens)</label>
            <input
              type="number"
              value={settings.vectorStores?.indexing?.chunkOverlap || 128}
              onChange={(e) => onSettingsChange({
                ...settings,
                vectorStores: {
                  ...settings.vectorStores,
                  indexing: {
                    ...settings.vectorStores?.indexing,
                    chunkOverlap: parseInt(e.target.value)
                  }
                }
              })}
              className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
        </div>
      </div>

      {/* Status and Actions */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-white">Vector Store Status</h4>
            <p className="text-sm text-gray-400 mt-1">
              {selectedStore === 'local' ? 'Ready to use' : 'Configuration required'}
            </p>
          </div>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors">
            Open Index Manager
          </button>
        </div>
      </div>
    </div>
  );
};