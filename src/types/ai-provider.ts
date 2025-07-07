export interface AIModel {
  id: string;
  name: string;
  description?: string;
  contextWindow: number;
  maxTokens: number;
  inputCost?: number;  // Cost per 1K tokens
  outputCost?: number; // Cost per 1K tokens
  features: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    codeGeneration: boolean;
  };
}

export interface AIProviderEndpoints {
  models: string | null;
  chat: string | null;
  completion: string | null;
}

export interface AIProviderAuthentication {
  type: 'bearer' | 'api-key' | 'local' | 'cli';
  header?: string;
}

export interface AIProviderFeatures {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  maxTokens: number;
  contextWindow: number;
}

export interface AIProviderRateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export interface AIProviderRequirements {
  command?: string;
  minVersion?: string;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  description: string;
  endpoints: AIProviderEndpoints;
  authentication: AIProviderAuthentication;
  defaultModel: string;
  modelSelectionDisabled?: boolean;
  features: AIProviderFeatures;
  rateLimit?: AIProviderRateLimit;
  requirements?: AIProviderRequirements;
}

export interface AIProvidersConfig {
  providers: {
    [key: string]: AIProviderConfig;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: any[];
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: {
    message: ChatMessage;
    finishReason: string;
  }[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamingChatResponse {
  id: string;
  model: string;
  delta: {
    role?: string;
    content?: string;
  };
  finishReason?: string;
}

// Abstract interface that each provider must implement
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly config: AIProviderConfig;

  // Check if provider is available (API key set, CLI installed, etc.)
  isAvailable(): Promise<boolean>;

  // Fetch available models from the provider
  getModels(): Promise<AIModel[]>;

  // Chat completion (non-streaming)
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  // Streaming chat completion
  streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamingChatResponse>;

  // Validate API credentials
  validateCredentials(apiKey?: string): Promise<boolean>;

  // Test connection to the provider
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

export interface AIProviderManager {
  // Get all registered providers
  getProviders(): AIProvider[];

  // Get a specific provider by ID
  getProvider(id: string): AIProvider | undefined;

  // Get available providers (those that have credentials/CLI available)
  getAvailableProviders(): Promise<AIProvider[]>;

  // Register a new provider
  registerProvider(provider: AIProvider): void;

  // Set default provider and model
  setDefault(providerId: string, modelId: string): Promise<void>;

  // Get default provider and model
  getDefault(): Promise<{ providerId: string; modelId: string } | null>;
}