import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Bell, Palette, Zap, Users, Code, Save, Bot, Shield, Key, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink, Monitor, FileText, Terminal, Database, ChevronDown } from 'lucide-react';
import { MasterKeySetup } from './MasterKeySetup';
import { openExternalLink } from '../utils/system';
import { getAIProviderManager } from '../../services/ai-provider-manager';
import { AIProvider, AIModel } from '../../types/ai-provider';
import { AgentSettings } from './AgentSettings';

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

type SettingsCategory = 'general' | 'interface' | 'editor' | 'ai' | 'notifications' | 'agents' | 'data';

interface CategoryConfig {
  id: SettingsCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const Settings: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general');
  const [settings, setSettings] = useState({
    general: {
      language: 'en',
      autoUpdates: true,
      telemetry: false,
      startOnBoot: false
    },
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
      showAgentAvatars: true,
      sidebarPosition: 'left'
    },
    editor: {
      autoFormat: true,
      autoSave: true,
      showLineNumbers: true,
      fontSize: 14,
      tabSize: 2
    },
    data: {
      cacheSize: '500MB',
      clearOnExit: false,
      backupEnabled: true
    }
  });

  // Categories configuration
  const categories: CategoryConfig[] = [
    {
      id: 'general',
      label: 'General',
      icon: SettingsIcon,
      description: 'Basic application settings and preferences'
    },
    {
      id: 'interface',
      label: 'Interface',
      icon: Palette,
      description: 'Customize the look and feel of the application'
    },
    {
      id: 'editor',
      label: 'Code Editor',
      icon: Code,
      description: 'Configure code editing experience and behavior'
    },
    {
      id: 'ai',
      label: 'AI Services',
      icon: Bot,
      description: 'Manage AI integrations and API configurations'
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      description: 'Control when and how you receive notifications'
    },
    {
      id: 'agents',
      label: 'AI Agents',
      icon: Users,
      description: 'Configure AI agent behavior and responses'
    },
    {
      id: 'data',
      label: 'Data & Storage',
      icon: Database,
      description: 'Manage application data and storage preferences'
    }
  ];

  // AI Services state
  const [aiServices, setAiServices] = useState<AIService[]>([]);
  const [serviceConfigs, setServiceConfigs] = useState<{[key: string]: ServiceConfig}>({});
  const [showMasterKeySetup, setShowMasterKeySetup] = useState(false);
  const [isMasterKeySetup, setIsMasterKeySetup] = useState(false);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<{[key: string]: string}>({});
  const [showApiKeys, setShowApiKeys] = useState<{[key: string]: boolean}>({});
  const [loading, setLoading] = useState(false);

  // AI Provider and Model Selection state
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<string>('');
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [providerModels, setProviderModels] = useState<{[key: string]: AIModel[]}>({});
  const [selectedModels, setSelectedModels] = useState<{[key: string]: string}>({});

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
    loadAIProviders();
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
      // Load configurations for each service
      const configs: {[key: string]: ServiceConfig} = {};
      for (const service of services || []) {
        const config = await window.electronAPI?.ai?.getServiceConfig(service.id);
        if (config) {
          configs[service.id] = config;
        }
      }

      setServiceConfigs(configs);
      setAiServices(services || []);
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

  // AI Provider and Model Management Functions
  const loadAIProviders = async () => {
    try {
      setLoadingProviders(true);
      const providerManager = getAIProviderManager();
      const providers = await providerManager.getAvailableProviders();
      setAvailableProviders(providers);
      
      // Load models for each provider
      const modelsMap: {[key: string]: AIModel[]} = {};
      for (const provider of providers) {
        try {
          const models = await provider.getModels();
          modelsMap[provider.id] = models;
        } catch (error) {
          console.error(`Error loading models for ${provider.id}:`, error);
          modelsMap[provider.id] = [];
        }
      }
      setProviderModels(modelsMap);
      
      // Load current default
      const defaultConfig = await providerManager.getDefault();
      if (defaultConfig) {
        setDefaultProvider(defaultConfig.providerId);
        setDefaultModel(defaultConfig.modelId);
        // Set the selected model for the default provider
        setSelectedModels(prev => ({
          ...prev,
          [defaultConfig.providerId]: defaultConfig.modelId
        }));
      }
    } catch (error) {
      console.error('Error loading AI providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleModelSelection = (providerId: string, modelId: string) => {
    setSelectedModels(prev => ({
      ...prev,
      [providerId]: modelId
    }));
  };

  const makeDefault = async (providerId: string, modelId: string) => {
    try {
      setLoading(true);
      const providerManager = getAIProviderManager();
      await providerManager.setDefault(providerId, modelId);
      setDefaultProvider(providerId);
      setDefaultModel(modelId);
      // Update selected model for this provider
      setSelectedModels(prev => ({
        ...prev,
        [providerId]: modelId
      }));
    } catch (error) {
      console.error('Error setting default:', error);
      alert('Failed to set as default');
    } finally {
      setLoading(false);
    }
  };

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'general':
        return renderGeneralSettings();
      case 'interface':
        return renderInterfaceSettings();
      case 'editor':
        return renderEditorSettings();
      case 'ai':
        return renderAISettings();
      case 'notifications':
        return renderNotificationSettings();
      case 'agents':
        return renderAgentSettings();
      case 'data':
        return renderDataSettings();
      default:
        return null;
    }
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">General Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Auto Updates</label>
              <p className="text-gray-400 text-sm">Automatically update to the latest version</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.general.autoUpdates}
                onChange={(e) => updateSetting('general', 'autoUpdates', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Share Usage Data</label>
              <p className="text-gray-400 text-sm">Help improve LabRats by sharing anonymous usage data</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.general.telemetry}
                onChange={(e) => updateSetting('general', 'telemetry', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Start on Boot</label>
              <p className="text-gray-400 text-sm">Launch LabRats when your computer starts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.general.startOnBoot}
                onChange={(e) => updateSetting('general', 'startOnBoot', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInterfaceSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Appearance</h3>
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
    </div>
  );

  const renderEditorSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Code Editor</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Auto Format</label>
              <p className="text-gray-400 text-sm">Automatically format code on save</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.editor.autoFormat}
                onChange={(e) => updateSetting('editor', 'autoFormat', e.target.checked)}
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
                checked={settings.editor.autoSave}
                onChange={(e) => updateSetting('editor', 'autoSave', e.target.checked)}
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
                checked={settings.editor.showLineNumbers}
                onChange={(e) => updateSetting('editor', 'showLineNumbers', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="text-white font-medium block mb-2">Font Size</label>
            <input
              type="range"
              min="10"
              max="24"
              value={settings.editor.fontSize}
              onChange={(e) => updateSetting('editor', 'fontSize', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>10px</span>
              <span className="text-white font-medium">{settings.editor.fontSize}px</span>
              <span>24px</span>
            </div>
          </div>

          <div>
            <label className="text-white font-medium block mb-2">Tab Size</label>
            <input
              type="range"
              min="2"
              max="8"
              step="2"
              value={settings.editor.tabSize}
              onChange={(e) => updateSetting('editor', 'tabSize', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-sm text-gray-400 mt-1">
              <span>2</span>
              <span className="text-white font-medium">{settings.editor.tabSize} spaces</span>
              <span>8</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Notification Preferences</h3>
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
    </div>
  );

  const renderAgentSettings = () => (
    <AgentSettings />
  );

  const renderDataSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Data Management</h3>
        <div className="space-y-4">
          <div>
            <label className="text-white font-medium block mb-2">Cache Size Limit</label>
            <select
              value={settings.data.cacheSize}
              onChange={(e) => updateSetting('data', 'cacheSize', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="100MB">100 MB</option>
              <option value="250MB">250 MB</option>
              <option value="500MB">500 MB</option>
              <option value="1GB">1 GB</option>
              <option value="2GB">2 GB</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Clear Cache on Exit</label>
              <p className="text-gray-400 text-sm">Automatically clear cache when closing the app</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.data.clearOnExit}
                onChange={(e) => updateSetting('data', 'clearOnExit', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-white font-medium">Enable Backups</label>
              <p className="text-gray-400 text-sm">Automatically backup settings and data</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.data.backupEnabled}
                onChange={(e) => updateSetting('data', 'backupEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
              Clear All Data
            </button>
            <p className="text-gray-400 text-sm mt-2">This will permanently delete all application data</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAISettings = () => {
    if (!isMasterKeySetup) {
      return (
        <div className="space-y-6">
          <div className="text-center py-12">
            <Shield className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Master Key Required</h3>
            <p className="text-gray-400 mb-6">Set up a master key to securely store your AI service API keys</p>
            <button
              onClick={() => setShowMasterKeySetup(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Setup Master Key
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">

        {/* AI Service Configuration */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">AI Service Configuration</h3>
          <div className="space-y-4">
            {aiServices.map(service => {
              const config = serviceConfigs[service.id];
              const isEditing = editingService === service.id;
              const hasKey = config?.hasApiKey;
              const isEnabled = config?.enabled;

              return (
                <div key={service.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">{service.name}</h4>
                      <p className="text-gray-400 text-sm">{service.description}</p>
                      {service.docs && (
                        <button 
                          onClick={() => openExternalLink(service.docs!)}
                          className="text-blue-400 hover:text-blue-300 text-sm mt-1 flex items-center"
                        >
                          API Documentation <ExternalLink className="w-3 h-3 ml-1" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-4">
                      {hasKey && (
                        <span className="flex items-center text-green-400 text-sm">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          API Key set
                        </span>
                      )}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => handleToggleService(service.id, e.target.checked)}
                          className="sr-only peer"
                          disabled={!hasKey}
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

                  {service.keyRequired && (
                    <div className="mt-4 space-y-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <input
                              type={showApiKeys[service.id] ? 'text' : 'password'}
                              placeholder={service.keyPlaceholder}
                              value={apiKeyInputs[service.id] || ''}
                              onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [service.id]: e.target.value }))}
                              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 pr-10 focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => setShowApiKeys(prev => ({ ...prev, [service.id]: !prev[service.id] }))}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                            >
                              {showApiKeys[service.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSaveAPIKey(service.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md font-medium"
                              disabled={loading}
                            >
                              {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingService(null)}
                              className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-4">
                          <button
                            onClick={() => setEditingService(service.id)}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-md font-medium"
                          >
                            {hasKey ? 'Update API Key' : 'Add API Key'}
                          </button>
                          {hasKey && (
                            <button
                              onClick={() => handleRemoveAPIKey(service.id)}
                              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-sm rounded-md font-medium"
                              disabled={loading}
                            >
                              {loading ? 'Removing...' : 'Remove'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Model Selection */}
                      {hasKey && isEnabled && providerModels[service.id] && providerModels[service.id].length > 0 && (
                        <div className="border-t border-gray-600 pt-4">
                          <h5 className="text-white font-medium mb-3">Model Selection</h5>
                          
                          {/* Model Dropdown */}
                          <div className="mb-4">
                            <label className="text-sm text-gray-300 block mb-2">Select Model:</label>
                            <div className="relative">
                              <select
                                value={selectedModels[service.id] || ''}
                                onChange={(e) => handleModelSelection(service.id, e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-10"
                              >
                                <option value="">Select a model...</option>
                                {providerModels[service.id].map(model => (
                                  <option key={model.id} value={model.id}>
                                    {model.name}
                                    {defaultProvider === service.id && defaultModel === model.id ? ' (Default)' : ''}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </div>

                          {/* Selected Model Details */}
                          {selectedModels[service.id] && (() => {
                            const selectedModel = providerModels[service.id].find(m => m.id === selectedModels[service.id]);
                            if (!selectedModel) return null;
                            const isDefault = defaultProvider === service.id && defaultModel === selectedModel.id;
                            
                            return (
                              <div className="p-4 bg-gray-700 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center space-x-2">
                                    <h6 className="text-white font-medium">{selectedModel.name}</h6>
                                    {isDefault && (
                                      <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">
                                        Default
                                      </span>
                                    )}
                                  </div>
                                  {!isDefault && (
                                    <button
                                      onClick={() => makeDefault(service.id, selectedModel.id)}
                                      disabled={loading}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white text-sm rounded-md font-medium"
                                    >
                                      {loading ? 'Setting...' : 'Make Default'}
                                    </button>
                                  )}
                                </div>
                                
                                <p className="text-gray-400 text-sm mb-3">{selectedModel.description}</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-400 mb-3">
                                  <div className="flex items-center space-x-1">
                                    <span className="text-gray-300 font-medium">Context:</span>
                                    <span>{selectedModel.contextWindow.toLocaleString()} tokens</span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <span className="text-gray-300 font-medium">Max Tokens:</span>
                                    <span>{selectedModel.maxTokens.toLocaleString()}</span>
                                  </div>
                                  {selectedModel.inputCost && (
                                    <div className="flex items-center space-x-1">
                                      <span className="text-gray-300 font-medium">Cost:</span>
                                      <span>${selectedModel.inputCost}/${selectedModel.outputCost} per 1K tokens</span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Features */}
                                <div className="flex flex-wrap gap-2">
                                  {selectedModel.features.streaming && (
                                    <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                                      Streaming
                                    </span>
                                  )}
                                  {selectedModel.features.functionCalling && (
                                    <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                                      Function Calling
                                    </span>
                                  )}
                                  {selectedModel.features.vision && (
                                    <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded">
                                      Vision
                                    </span>
                                  )}
                                  {selectedModel.features.codeGeneration && (
                                    <span className="px-2 py-1 bg-orange-600 text-white text-xs rounded">
                                      Code Generation
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full bg-gray-900 flex overflow-hidden min-h-0">
      {/* Master Key Setup Modal */}
      <MasterKeySetup
        isOpen={showMasterKeySetup}
        onComplete={handleMasterKeySetup}
        onCancel={() => setShowMasterKeySetup(false)}
      />

      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col h-full overflow-hidden min-h-0">
        <div className="p-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="space-y-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                <cat.icon className="w-5 h-5" />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-8">
            {(() => {
              const activeCat = categories.find(c => c.id === activeCategory);
              return (
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-white">{activeCat?.label}</h2>
                  <p className="text-gray-400 mt-1">{activeCat?.description}</p>
                </div>
              );
            })()}
            
            <div className="text-white">
              {renderCategoryContent()}
            </div>
            
            {/* Add bottom padding to ensure last item is visible */}
            <div className="h-16"></div>
          </div>
        </div>
      </main>
    </div>
  );
};
