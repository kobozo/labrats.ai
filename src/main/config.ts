import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { app } from 'electron';
import { LABRATS_CONFIG_DIR, CONFIG_PATHS } from './constants';

export interface LabRatsConfig {
  // General settings
  general: {
    language: string;
    autoUpdates: boolean;
    telemetry: boolean;
    startOnBoot: boolean;
  };

  // Interface settings
  interface: {
    theme: 'dark' | 'light' | 'auto';
    compactMode: boolean;
    showAgentAvatars: boolean;
    sidebarPosition: 'left' | 'right';
  };

  // Editor settings
  editor: {
    autoFormat: boolean;
    autoSave: boolean;
    showLineNumbers: boolean;
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
  };
  
  // AI settings
  ai: {
    temperature: number;
    maxTokens: number;
    streamResponses: boolean;
    autoSuggest: boolean;
    services: {
      [serviceId: string]: {
        enabled: boolean;
        encryptedApiKey?: string;
      };
    };
  };

  // LabRats Backend settings
  backend: {
    enabled: boolean;
    labrats_llm: {
      endpoint: string;
      model: string;
      timeout: number;
    };
  };

  // Notifications settings
  notifications: {
    agentActions: boolean;
    codeReviews: boolean;
    commits: boolean;
    errors: boolean;
  };

  // Agent settings
  agents: {
    defaultProvider: string;
    defaultModel: string;
    autoActivate: boolean;
    maxActive: number;
    responseDelay: number;
    overrides?: {
      [agentId: string]: {
        provider: string;
        model: string;
        colorAccent?: string;
      };
    };
  };

  // Data & Storage settings
  data: {
    cacheSize: string;
    clearOnExit: boolean;
    backupEnabled: boolean;
  };
  
  // Window settings
  window: {
    restoreWindows: boolean;
    defaultWidth: number;
    defaultHeight: number;
    showStatusBar: boolean;
  };
  
  // File explorer settings
  fileExplorer: {
    showHiddenFiles: boolean;
    excludePatterns: string[];
    sortBy: 'name' | 'modified' | 'size';
    collapseFoldersOnOpen: boolean;
  };
  
  // Chat settings
  chat: {
    saveHistory: boolean;
    historyLimit: number;
    showAgentAvatars: boolean;
    timestampFormat: string;
  };
  
  // Development settings
  development: {
    enableDebugMode: boolean;
    verboseLogging: boolean;
    showDevTools: boolean;
  };
}

const DEFAULT_CONFIG: LabRatsConfig = {
  general: {
    language: 'en',
    autoUpdates: true,
    telemetry: false,
    startOnBoot: false,
  },

  interface: {
    theme: 'dark',
    compactMode: false,
    showAgentAvatars: true,
    sidebarPosition: 'left',
  },

  editor: {
    autoFormat: true,
    autoSave: true,
    showLineNumbers: true,
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, Consolas, "Courier New", monospace',
    tabSize: 2,
    wordWrap: true,
    minimap: true,
  },
  
  ai: {
    temperature: 0.7,
    maxTokens: 4096,
    streamResponses: true,
    autoSuggest: true,
    services: {},
  },

  backend: {
    enabled: true,
    labrats_llm: {
      endpoint: 'http://localhost:11434',
      model: 'mistral:latest',
      timeout: 30000,
    },
  },

  notifications: {
    agentActions: true,
    codeReviews: true,
    commits: false,
    errors: true,
  },

  agents: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    autoActivate: true,
    maxActive: 6,
    responseDelay: 1000,
    overrides: {},
  },

  data: {
    cacheSize: '500MB',
    clearOnExit: false,
    backupEnabled: true,
  },
  
  window: {
    restoreWindows: true,
    defaultWidth: 1200,
    defaultHeight: 800,
    showStatusBar: true,
  },
  
  fileExplorer: {
    showHiddenFiles: false,
    excludePatterns: ['node_modules', '.git', '.DS_Store', '*.pyc', '__pycache__'],
    sortBy: 'name',
    collapseFoldersOnOpen: false,
  },
  
  chat: {
    saveHistory: true,
    historyLimit: 100,
    showAgentAvatars: true,
    timestampFormat: 'HH:mm',
  },
  
  development: {
    enableDebugMode: false,
    verboseLogging: false,
    showDevTools: false,
  },
};

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private config: LabRatsConfig;
  
  constructor() {
    // Use centralized config directory and paths
    this.configDir = LABRATS_CONFIG_DIR;
    this.configPath = CONFIG_PATHS.configFile;
    this.config = this.loadConfig();
  }
  
  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }
  
  private loadConfig(): LabRatsConfig {
    this.ensureConfigDir();
    
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = yaml.load(configContent) as Partial<LabRatsConfig>;
        
        // Merge with defaults to ensure all fields exist
        return this.mergeConfigs(DEFAULT_CONFIG, loadedConfig);
      }
    } catch (error) {
      console.error('Error loading config.yaml, attempting recovery:', error);
      return this.recoverCorruptedConfig();
    }
    
    // If no config exists, create default config
    this.saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  private recoverCorruptedConfig(): LabRatsConfig {
    try {
      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.configDir, `config.backup.${timestamp}.yaml`);
      
      console.log(`Backing up corrupted config.yaml to: ${backupPath}`);
      fs.copyFileSync(this.configPath, backupPath);
      
      // Remove corrupted file
      fs.unlinkSync(this.configPath);
      console.log('Removed corrupted config.yaml file');
      
      // Create fresh config
      console.log('Creating fresh config.yaml with default values');
      this.saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
      
    } catch (backupError) {
      console.error('Failed to backup corrupted config.yaml:', backupError);
      // Even if backup fails, try to remove the corrupted file and start fresh
      try {
        fs.unlinkSync(this.configPath);
        this.saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      } catch (removeError) {
        console.error('Failed to remove corrupted config.yaml:', removeError);
        console.log('Using in-memory default config');
        return DEFAULT_CONFIG;
      }
    }
  }
  
  private mergeConfigs(defaults: LabRatsConfig, loaded: Partial<LabRatsConfig>): LabRatsConfig {
    const merged = { ...defaults };
    
    // Deep merge the loaded config with defaults
    for (const key in loaded) {
      if (loaded.hasOwnProperty(key)) {
        const loadedValue = loaded[key as keyof LabRatsConfig];
        if (typeof loadedValue === 'object' && !Array.isArray(loadedValue)) {
          merged[key as keyof LabRatsConfig] = {
            ...defaults[key as keyof LabRatsConfig],
            ...loadedValue,
          } as any;
        } else {
          merged[key as keyof LabRatsConfig] = loadedValue as any;
        }
      }
    }
    
    return merged;
  }
  
  private saveConfig(config: LabRatsConfig): void {
    try {
      this.ensureConfigDir();
      
      // Convert to YAML with nice formatting
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 80,
        sortKeys: false,
      });
      
      // Add header comment
      const header = `# LabRats.ai Configuration File
# This file is automatically generated but can be manually edited
# Location: ${this.configPath}
# Documentation: https://labrats.ai/docs/configuration

`;
      
      fs.writeFileSync(this.configPath, header + yamlContent, 'utf-8');
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }
  
  public get<K extends keyof LabRatsConfig>(key: K): LabRatsConfig[K];
  public get<K extends keyof LabRatsConfig, P extends keyof LabRatsConfig[K]>(
    key: K,
    property: P
  ): LabRatsConfig[K][P];
  public get(key: string, property?: string): any {
    const typedKey = key as keyof LabRatsConfig;
    if (property) {
      return (this.config[typedKey] as any)?.[property];
    }
    return this.config[typedKey];
  }
  
  public set<K extends keyof LabRatsConfig>(key: K, value: LabRatsConfig[K]): void;
  public set<K extends keyof LabRatsConfig, P extends keyof LabRatsConfig[K]>(
    key: K,
    property: P,
    value: LabRatsConfig[K][P]
  ): void;
  public set(key: string, propertyOrValue: any, value?: any): void {
    const typedKey = key as keyof LabRatsConfig;
    
    if (value !== undefined) {
      // Setting nested property
      if (!this.config[typedKey]) {
        (this.config as any)[typedKey] = {};
      }
      (this.config[typedKey] as any)[propertyOrValue] = value;
    } else {
      // Setting top-level property
      (this.config as any)[typedKey] = propertyOrValue;
    }
    
    this.saveConfig(this.config);
  }
  
  public getAll(): LabRatsConfig {
    return { ...this.config };
  }
  
  public reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig(this.config);
  }
  
  public getConfigPath(): string {
    return this.configPath;
  }
  
  public openConfigFile(): void {
    const { shell } = require('electron');
    shell.openPath(this.configPath);
  }
}