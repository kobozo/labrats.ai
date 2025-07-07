import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Bell, Palette, Zap, Users, Code, Save, Bot, Shield, Key, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { MasterKeySetup } from './MasterKeySetup';

interface AIService {
  id: string;
  name: string;
  description: string;
  keyRequired: boolean;
  keyPlaceholder: string;
  docs?: string;
  enabled: boolean;
}

interface ServiceConfig {
  id: string;
  enabled: boolean;
  hasApiKey: boolean;
}

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    notifications: {
      agentActions: true,
      codeReviews: true,
      commits: false,
      errors: true
    },
    agents: {
      autoActivate: true,
      maxActive: 6,
      responseDelay: 1000
    },
    interface: {
      theme: 'dark',
      compactMode: false,
      showAgentAvatars: true
    },
    code: {
      autoFormat: true,
      autoSave: true,
      showLineNumbers: true
    }
  });

  // AI Services state
  const [aiServices, setAiServices] = useState<AIService[]>([]);
  const [serviceConfigs, setServiceConfigs] = useState<{[key: string]: ServiceConfig}>({});
  const [showMasterKeySetup, setShowMasterKeySetup] = useState(false);
  const [isMasterKeySetup, setIsMasterKeySetup] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<{[key: string]: string}>({});
  const [showApiKeys, setShowApiKeys] = useState<{[key: string]: boolean}>({});
  const [loading, setLoading] = useState(false);

  const updateSetting = (category: string, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category as keyof typeof prev],
        [key]: value
      }
    }));
  };

  // Load AI services and check master key setup
  useEffect(() => {
    loadAIServices();
    checkMasterKeySetup();
  }, []);

  const checkMasterKeySetup = async () => {
    try {
      const isSetup = await window.electronAPI?.ai?.isMasterKeySetup();
      setIsMasterKeySetup(isSetup || false);
      if (!isSetup) {
        setShowMasterKeySetup(true);
      }
    } catch (error) {
      console.error('Error checking master key setup:', error);
    }
  };

  const loadAIServices = async () => {
    try {
      const services = await window.electronAPI?.ai?.getSupportedServices();
      setAiServices(services || []);
      
      // Load configurations for each service
      const configs: {[key: string]: ServiceConfig} = {};
      for (const service of services || []) {
        const config = await window.electronAPI?.ai?.getServiceConfig(service.id);
        if (config) {
          configs[service.id] = config;
        }
      }
      setServiceConfigs(configs);
    } catch (error) {
      console.error('Error loading AI services:', error);
    }
  };

  const handleMasterKeySetup = async (masterKey: string) => {
    try {
      setLoading(true);
      const result = await window.electronAPI?.ai?.setupMasterKey(masterKey);
      if (result?.success) {
        setIsMasterKeySetup(true);
        setShowMasterKeySetup(false);
        await loadAIServices();
      } else {
        alert(`Failed to setup master key: ${result?.error}`);
      }
    } catch (error) {
      console.error('Error setting up master key:', error);
      alert('Failed to setup master key');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAPIKey = async (serviceId: string) => {
    const apiKey = apiKeyInputs[serviceId];
    if (!apiKey) return;

    try {
      setLoading(true);
      
      // Validate API key
      const validation = await window.electronAPI?.ai?.validateAPIKey(serviceId, apiKey);
      if (!validation?.valid) {
        alert(validation?.error || 'Invalid API key');
        return;
      }

      // Store API key
      const result = await window.electronAPI?.ai?.storeAPIKey(serviceId, apiKey);
      if (result?.success) {
        // Clear input and reload config
        setApiKeyInputs(prev => ({ ...prev, [serviceId]: '' }));
        setEditingService(null);
        await loadAIServices();
      } else {
        alert(`Failed to save API key: ${result?.error}`);
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAPIKey = async (serviceId: string) => {
    if (!confirm('Are you sure you want to remove this API key?')) return;

    try {
      setLoading(true);
      const result = await window.electronAPI?.ai?.removeAPIKey(serviceId);
      if (result?.success) {
        await loadAIServices();
      } else {
        alert(`Failed to remove API key: ${result?.error}`);
      }
    } catch (error) {
      console.error('Error removing API key:', error);
      alert('Failed to remove API key');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleService = async (serviceId: string, enabled: boolean) => {
    try {
      const result = await window.electronAPI?.ai?.setServiceEnabled(serviceId, enabled);
      if (result?.success) {
        await loadAIServices();
      } else {
        alert(`Failed to update service: ${result?.error}`);
      }
    } catch (error) {
      console.error('Error toggling service:', error);
      alert('Failed to update service');
    }
  };

  return (
    <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Configure your AI-first development environment</p>
        </div>

        <div className="space-y-6">
          {/* Notifications */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <Bell className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Notifications</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Agent Actions</label>
                  <p className="text-gray-400 text-sm">Get notified when agents perform actions</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications.agentActions}
                    onChange={(e) => updateSetting('notifications', 'agentActions', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Code Reviews</label>
                  <p className="text-gray-400 text-sm">Get notified about code review status</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications.codeReviews}
                    onChange={(e) => updateSetting('notifications', 'codeReviews', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Commits</label>
                  <p className="text-gray-400 text-sm">Get notified about git commits</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notifications.commits}
                    onChange={(e) => updateSetting('notifications', 'commits', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Agent Settings */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <Users className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-semibold text-white">Agent Configuration</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Auto-activate Agents</label>
                  <p className="text-gray-400 text-sm">Automatically bring in relevant agents for tasks</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.agents.autoActivate}
                    onChange={(e) => updateSetting('agents', 'autoActivate', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div>
                <label className="text-white font-medium block mb-2">Maximum Active Agents</label>
                <input
                  type="range"
                  min="2"
                  max="10"
                  value={settings.agents.maxActive}
                  onChange={(e) => updateSetting('agents', 'maxActive', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm text-gray-400 mt-1">
                  <span>2</span>
                  <span className="text-white font-medium">{settings.agents.maxActive}</span>
                  <span>10</span>
                </div>
              </div>
              
              <div>
                <label className="text-white font-medium block mb-2">Response Delay (ms)</label>
                <input
                  type="range"
                  min="500"
                  max="5000"
                  step="500"
                  value={settings.agents.responseDelay}
                  onChange={(e) => updateSetting('agents', 'responseDelay', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-sm text-gray-400 mt-1">
                  <span>500ms</span>
                  <span className="text-white font-medium">{settings.agents.responseDelay}ms</span>
                  <span>5000ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interface */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <Palette className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Interface</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white font-medium block mb-2">Theme</label>
                <select
                  value={settings.interface.theme}
                  onChange={(e) => updateSetting('interface', 'theme', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Compact Mode</label>
                  <p className="text-gray-400 text-sm">Use smaller spacing and components</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.interface.compactMode}
                    onChange={(e) => updateSetting('interface', 'compactMode', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Show Agent Avatars</label>
                  <p className="text-gray-400 text-sm">Display agent icons in chat and notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.interface.showAgentAvatars}
                    onChange={(e) => updateSetting('interface', 'showAgentAvatars', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Code Editor */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center space-x-3 mb-4">
              <Code className="w-6 h-6 text-orange-400" />
              <h2 className="text-xl font-semibold text-white">Code Editor</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Auto Format</label>
                  <p className="text-gray-400 text-sm">Automatically format code on save</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.code.autoFormat}
                    onChange={(e) => updateSetting('code', 'autoFormat', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Auto Save</label>
                  <p className="text-gray-400 text-sm">Automatically save changes</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.code.autoSave}
                    onChange={(e) => updateSetting('code', 'autoSave', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-medium">Show Line Numbers</label>
                  <p className="text-gray-400 text-sm">Display line numbers in code editor</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.code.showLineNumbers}
                    onChange={(e) => updateSetting('code', 'showLineNumbers', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
          {/* AI Services */}
          {isMasterKeySetup && (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center space-x-3 mb-4">
                <Bot className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-semibold text-white">AI Services</h2>
                <Shield className="w-5 h-5 text-green-400" />
              </div>
              
              <p className="text-gray-400 text-sm mb-6">
                Configure your AI service API keys. All keys are encrypted using your master key.
              </p>

              <div className="space-y-4">
                {aiServices.map(service => {
                  const config = serviceConfigs[service.id];
                  const isEditing = editingService === service.id;
                  const showKey = showApiKeys[service.id];

                  return (
                    <div key={service.id} className="border border-gray-600 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-white font-medium">{service.name}</h3>
                            {config?.hasApiKey && (
                              <div className="flex items-center space-x-1 text-green-400">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-xs">Configured</span>
                              </div>
                            )}
                            {service.docs && (
                              <a
                                href={service.docs}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                                title="API Documentation"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mt-1">{service.description}</p>
                        </div>
                        
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config?.enabled || false}
                            onChange={(e) => handleToggleService(service.id, e.target.checked)}
                            className="sr-only peer"
                            disabled={loading}
                          />
                          <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>

                      {service.keyRequired && (
                        <div className="mt-3">
                          {!isEditing ? (
                            <div className="flex items-center space-x-3">
                              {config?.hasApiKey ? (
                                <>
                                  <div className="flex-1 flex items-center space-x-2">
                                    <Key className="w-4 h-4 text-green-400" />
                                    <span className="text-green-400 text-sm">API Key configured</span>
                                  </div>
                                  <button
                                    onClick={() => setEditingService(service.id)}
                                    className="px-3 py-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                                  >
                                    Update
                                  </button>
                                  <button
                                    onClick={() => handleRemoveAPIKey(service.id)}
                                    className="px-3 py-1 text-red-400 hover:text-red-300 text-sm transition-colors"
                                    disabled={loading}
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div className="flex-1 flex items-center space-x-2">
                                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                                    <span className="text-yellow-400 text-sm">API Key required</span>
                                  </div>
                                  <button
                                    onClick={() => setEditingService(service.id)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                                  >
                                    Add Key
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                  API Key
                                </label>
                                <div className="relative">
                                  <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeyInputs[service.id] || ''}
                                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [service.id]: e.target.value }))}
                                    placeholder={service.keyPlaceholder}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  />
                                  <button
                                    onClick={() => setShowApiKeys(prev => ({ ...prev, [service.id]: !showKey }))}
                                    className="absolute right-3 top-2.5 text-gray-400 hover:text-white transition-colors"
                                  >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                              
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleSaveAPIKey(service.id)}
                                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors disabled:opacity-50"
                                  disabled={loading || !apiKeyInputs[service.id]}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingService(null);
                                    setApiKeyInputs(prev => ({ ...prev, [service.id]: '' }));
                                  }}
                                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Master Key Setup Dialog */}
      <MasterKeySetup
        isOpen={showMasterKeySetup}
        onComplete={handleMasterKeySetup}
        onCancel={() => setShowMasterKeySetup(false)}
      />
    </div>
  );
};