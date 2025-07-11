import React from 'react';
import { AIProviderConfig, AIModel } from '../../types/ai-provider';
import { ChevronDown } from 'lucide-react';

interface ProviderModelSelectorProps {
  showInherit: boolean;
  availableProviders: AIProviderConfig[];
  availableModels: AIModel[];
  loadingProviders: boolean;
  loadingModels: boolean;
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
}

export const ProviderModelSelector: React.FC<ProviderModelSelectorProps> = ({
  showInherit,
  availableProviders,
  availableModels,
  loadingProviders,
  loadingModels,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange
}) => {
  const providerOptions = showInherit
    ? [{ id: 'inherit', name: 'Inherit from default' } as AIProviderConfig].concat(availableProviders)
    : availableProviders;

  const selectedProviderObj = availableProviders.find(p => p.id === selectedProvider);
  const isModelSelectionDisabled = selectedProviderObj?.modelSelectionDisabled;

  const modelOptions = showInherit
    ? [{ id: 'inherit', name: 'Inherit from default' } as AIModel].concat(availableModels)
    : availableModels;

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div>
        <label className="text-white font-medium block mb-2">AI Provider</label>
        <div className="relative">
          <select
            value={selectedProvider}
            onChange={(e) => onProviderChange(e.target.value)}
            disabled={loadingProviders}
            className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
          >
            {loadingProviders && (
              <option value="">Loading providers...</option>
            )}
            {!loadingProviders && providerOptions.length === 0 && (
              <option value="">No providers available</option>
            )}
            {!loadingProviders && providerOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Model Selection */}
      <div>
        <label className="text-white font-medium block mb-2">AI Model</label>
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={loadingModels || !selectedProvider || isModelSelectionDisabled || (showInherit && selectedProvider === 'inherit')}
            className={`w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none disabled:opacity-50 ${isModelSelectionDisabled ? 'cursor-not-allowed' : ''}`}
          >
            {loadingModels && <option value="">Loading models...</option>}
            {!loadingModels && modelOptions.length === 0 && <option value="">No models</option>}
            {!loadingModels && modelOptions.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}; 