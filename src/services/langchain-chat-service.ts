import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { LLMResult } from '@langchain/core/outputs';
import { getAIProviderManager } from './ai-provider-manager';
import { chatHistoryManager } from './chat-history-manager-renderer';
import { langchainMcpClient } from './mcp/langchain-mcp-client';

export interface LangChainChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  providerId?: string;
  modelId?: string;
  structuredResponse?: any; // For storing structured JSON responses from agents
}

export interface TokenUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export interface LangChainChatResponse {
  success: boolean;
  message?: LangChainChatMessage;
  error?: string;
  tokenUsage?: TokenUsage;
}

export class LangChainChatService {
  private providerManager = getAIProviderManager();
  private conversationHistory: LangChainChatMessage[] = [];
  private currentProjectPath: string | null = null;
  private sessionTokenUsage: TokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
  private toolStatusCallback: ((status: string, toolName?: string) => void) | null = null;

  async sendMessage(
    content: string,
    options: {
      providerId?: string;
      modelId?: string;
      agentId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<LangChainChatResponse> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      console.log('[LANGCHAIN] Using provider:', providerId, 'model:', modelId);
      
      // Variable to capture token usage
      let tokenUsage: TokenUsage | undefined;
      
      // Create LangChain chat model based on provider with token tracking callback
      const chatModel = await this.createChatModel(providerId, modelId, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        callbacks: [{
          handleLLMEnd: (output: LLMResult) => {
            // Extract token usage from LLM output
            if (output.llmOutput?.tokenUsage) {
              tokenUsage = {
                completionTokens: output.llmOutput.tokenUsage.completionTokens || 0,
                promptTokens: output.llmOutput.tokenUsage.promptTokens || 0,
                totalTokens: output.llmOutput.tokenUsage.totalTokens || 0
              };
              
              // Update session totals
              this.sessionTokenUsage.completionTokens += tokenUsage.completionTokens;
              this.sessionTokenUsage.promptTokens += tokenUsage.promptTokens;
              this.sessionTokenUsage.totalTokens += tokenUsage.totalTokens;
              
              console.log(`[TOKEN-USAGE] Current request: ${tokenUsage.promptTokens} prompt + ${tokenUsage.completionTokens} completion = ${tokenUsage.totalTokens} total`);
              console.log(`[TOKEN-USAGE] Session total: ${this.sessionTokenUsage.totalTokens} tokens`);
            }
          }
        }]
      });

      // Build message history
      const messages: BaseMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === 'system') {
          messages.push(new SystemMessage(msg.content));
        }
      }

      // Add current user message
      messages.push(new HumanMessage(content));

      // Add current user message to history
      const userMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };
      this.conversationHistory.push(userMessage);
      await this.persistConversationHistory();

      // Check if MCP client is connected and get tools
      let processedContent = '';
      let toolsAvailable = false;
      let mcpTools: any[] = [];
      
      console.log('[LANGCHAIN] Checking MCP client connection...');
      
      if (langchainMcpClient.isConnected()) {
        console.log('[LANGCHAIN] MCP client connected, getting tools...');
        mcpTools = langchainMcpClient.getLangChainTools();
        toolsAvailable = mcpTools.length > 0;
        console.log('[LANGCHAIN] Tools available:', mcpTools.map(t => t.name));
        
        // Check if model supports tools
        if (modelId === 'gpt-4o-mini' || modelId === 'gpt-3.5-turbo') {
          console.warn('[LANGCHAIN] Warning: Model', modelId, 'may have limited tool support. Consider using gpt-4-turbo or gpt-4o for better tool calling.');
        }
      } else {
        console.log('[LANGCHAIN] MCP client not connected');
      }
      
      if (toolsAvailable) {
        console.log('[LANGCHAIN] Binding', mcpTools.length, 'tools to model...');
        console.log('[LANGCHAIN] Tools:', mcpTools.map(t => t.name));
        
        // Bind tools to the model with explicit tool usage instruction
        const modelWithTools = chatModel.bindTools(mcpTools, {
          tool_choice: "auto", // Let the model decide when to use tools
        });
        
        // Invoke the model
        const aiMsg = await modelWithTools.invoke(messages);
        
        console.log('[LANGCHAIN] AI response:', {
          hasContent: !!aiMsg.content,
          contentType: typeof aiMsg.content,
          hasToolCalls: !!aiMsg.tool_calls,
          toolCallsLength: aiMsg.tool_calls?.length || 0
        });
        
        // Initialize content
        let finalContent = '';
        
        // Get the AI's message content
        if (typeof aiMsg.content === 'string') {
          finalContent = aiMsg.content;
        } else if (Array.isArray(aiMsg.content)) {
          // Handle array content (tool calls might be here)
          for (const content of aiMsg.content) {
            if (typeof content === 'string') {
              finalContent += content;
            } else if (typeof content === 'object' && content !== null && 'text' in content) {
              finalContent += (content as any).text;
            }
          }
        }
        
        // Check if the model wants to use tools
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          console.log('[LANGCHAIN] Model requested', aiMsg.tool_calls.length, 'tool calls');
          
          // Execute tools and collect results for further processing
          const toolResults = [];
          
          for (const toolCall of aiMsg.tool_calls) {
            console.log('[LANGCHAIN] Executing tool:', toolCall.name, 'with args:', toolCall.args);
            
            // Emit tool status
            this.emitToolStatus(`🔧 Using ${this.formatToolName(toolCall.name)}...`, toolCall.name);
            
            const tool = mcpTools.find(t => t.name === toolCall.name);
            if (tool) {
              try {
                const result = await tool.invoke(toolCall.args);
                console.log('[LANGCHAIN] Tool result length:', result.length);
                
                toolResults.push({
                  toolCall,
                  result,
                  success: true
                });
              } catch (error) {
                console.error('[LANGCHAIN] Tool error:', error);
                toolResults.push({
                  toolCall,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  success: false
                });
              }
            } else {
              console.error('[LANGCHAIN] Tool not found:', toolCall.name);
              toolResults.push({
                toolCall,
                error: `Tool '${toolCall.name}' not found`,
                success: false
              });
            }
          }
          
          // Now we need to decide: should we process these results further or display them?
          // We'll use the tool results to create a follow-up response
          finalContent = await this.processToolResults(toolResults, messages, modelWithTools, finalContent);
        } else {
          console.log('[LANGCHAIN] No tool calls requested by model');
        }
        
        processedContent = finalContent || 'I understand you want to see files, but I need to use the file listing tool. Let me try again.';
      } else {
        console.log('[LANGCHAIN] No tools available, using regular model');
        const response = await chatModel.invoke(messages);
        processedContent = response.content.toString();
      }
      
      const assistantMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: processedContent,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      // Add to conversation history
      this.conversationHistory.push(assistantMessage);
      await this.persistConversationHistory();

      return {
        success: true,
        message: assistantMessage,
        tokenUsage
      };

    } catch (error) {
      console.error('Error in LangChain chat service:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async *sendMessageStream(
    content: string,
    options: {
      providerId?: string;
      modelId?: string;
      agentId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): AsyncGenerator<{ delta: string; isComplete: boolean; message?: LangChainChatMessage; error?: string }> {
    try {
      // Get provider and model
      const { providerId, modelId } = await this.getProviderAndModel(options);
      
      // Create LangChain chat model based on provider
      const chatModel = await this.createChatModel(providerId, modelId, {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4096,
        streaming: true
      });

      // Build message history
      const messages: BaseMessage[] = [];
      
      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
      }

      // Add conversation history
      for (const msg of this.conversationHistory) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        } else if (msg.role === 'system') {
          messages.push(new SystemMessage(msg.content));
        }
      }

      // Add current user message
      messages.push(new HumanMessage(content));

      // Add current user message to history
      const userMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };
      this.conversationHistory.push(userMessage);
      await this.persistConversationHistory();

      // Stream response from LangChain
      let fullContent = '';
      
      const stream = await chatModel.stream(messages);
      for await (const chunk of stream) {
        const delta = chunk.content.toString();
        if (delta) {
          fullContent += delta;
          yield {
            delta,
            isComplete: false
          };
        }
      }

      // Create final message
      const assistantMessage: LangChainChatMessage = {
        id: this.generateId(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
        agentId: options.agentId,
        providerId,
        modelId
      };

      // Add to conversation history
      this.conversationHistory.push(assistantMessage);
      await this.persistConversationHistory();

      yield {
        delta: '',
        isComplete: true,
        message: assistantMessage
      };

    } catch (error) {
      console.error('Error in LangChain streaming chat service:', error);
      yield {
        delta: '',
        isComplete: true,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async createChatModel(
    providerId: string, 
    modelId: string, 
    config: { temperature: number; maxTokens: number; streaming?: boolean; callbacks?: any[] }
  ) {
    const apiKey = await this.getApiKey(providerId);
    
    switch (providerId) {
      case 'openai':
        return new ChatOpenAI({
          modelName: modelId,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          streaming: config.streaming || false,
          openAIApiKey: apiKey,
          callbacks: config.callbacks
        });
      
      case 'anthropic':
        return new ChatAnthropic({
          model: modelId,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          streaming: config.streaming || false,
          anthropicApiKey: apiKey,
          callbacks: config.callbacks
        });
      
      default:
        throw new Error(`Unsupported provider for LangChain: ${providerId}`);
    }
  }

  private async getApiKey(providerId: string): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getAPIKey) {
      try {
        const result = await window.electronAPI.ai.getAPIKey(providerId);
        if (result.success && result.apiKey) {
          return result.apiKey;
        }
      } catch (error) {
        console.error('Error getting API key from store:', error);
      }
    }

    throw new Error(`No API key available for ${providerId}`);
  }

  private async getProviderAndModel(options: {
    providerId?: string;
    modelId?: string;
  }): Promise<{ providerId: string; modelId: string }> {
    let providerId = options.providerId;
    let modelId = options.modelId;

    // If not specified, use default
    if (!providerId || !modelId) {
      const defaultConfig = await this.providerManager.getDefault();
      if (defaultConfig) {
        providerId = providerId || defaultConfig.providerId;
        modelId = modelId || defaultConfig.modelId;
      }
    }

    // Fallback to first available provider
    if (!providerId || !modelId) {
      const availableProviders = await this.providerManager.getAvailableProviders();
      if (availableProviders.length > 0) {
        const firstProvider = availableProviders[0];
        providerId = providerId || firstProvider.id;
        modelId = modelId || firstProvider.config.defaultModel;
      }
    }

    if (!providerId || !modelId) {
      throw new Error('No AI provider or model available');
    }

    return { providerId, modelId };
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Set current project path for state management
  async setCurrentProject(projectPath: string | null): Promise<void> {
    console.log('[LANGCHAIN] Setting current project:', projectPath);
    this.currentProjectPath = projectPath;
    if (projectPath) {
      // Connect MCP client to the workspace
      try {
        await langchainMcpClient.connect(projectPath);
      } catch (error) {
        console.error('[LANGCHAIN] Failed to connect MCP client:', error);
      }
      
      // Load conversation history from chat history manager
      const persistedHistory = await chatHistoryManager.loadChatHistory(projectPath);
      this.conversationHistory = persistedHistory.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        agentId: msg.agentId,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
    } else {
      this.conversationHistory = [];
      await langchainMcpClient.disconnect();
    }
  }

  // Get conversation history
  getConversationHistory(): LangChainChatMessage[] {
    return [...this.conversationHistory];
  }

  // Clear conversation history
  async clearConversation(): Promise<void> {
    this.conversationHistory = [];
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
    if (this.currentProjectPath) {
      await chatHistoryManager.clearChatHistory(this.currentProjectPath);
    }
  }

  // Get session token usage
  getSessionTokenUsage(): TokenUsage {
    return { ...this.sessionTokenUsage };
  }

  // Clear session token usage
  clearSessionTokenUsage(): void {
    this.sessionTokenUsage = { completionTokens: 0, promptTokens: 0, totalTokens: 0 };
  }

  setToolStatusCallback(callback: ((status: string, toolName?: string) => void) | null) {
    this.toolStatusCallback = callback;
  }

  private emitToolStatus(status: string, toolName?: string) {
    if (this.toolStatusCallback) {
      this.toolStatusCallback(status, toolName);
    }
  }


  // Private method to persist conversation history
  private async persistConversationHistory(): Promise<void> {
    if (this.currentProjectPath) {
      // Convert LangChainChatMessage to ChatServiceMessage format
      const chatServiceMessages = this.conversationHistory.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        agentId: msg.agentId,
        providerId: msg.providerId,
        modelId: msg.modelId
      }));
      await chatHistoryManager.saveChatHistory(this.currentProjectPath, chatServiceMessages);
    }
  }

  // Get available providers
  async getAvailableProviders() {
    return this.providerManager.getAvailableProviders();
  }

  // Get provider models
  async getProviderModels(providerId: string) {
    const provider = this.providerManager.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return provider.getModels();
  }

  // Test provider connection
  async testProvider(providerId: string) {
    const provider = this.providerManager.getProvider(providerId);
    if (!provider) {
      return { success: false, error: `Provider ${providerId} not found` };
    }
    return provider.testConnection();
  }

  // Format tool results for better presentation
  private formatToolResult(toolName: string, result: string, args: any): string {
    try {
      const parsed = JSON.parse(result);
      
      switch (toolName) {
        case 'listFiles':
          return this.formatListFilesResult(parsed, args);
        case 'readFile':
          return this.formatReadFileResult(parsed, args);
        case 'replaceText':
          return this.formatReplaceTextResult(parsed, args);
        case 'execCommand':
          return this.formatExecCommandResult(parsed, args);
        case 'search_code':
          return this.formatSearchCodeResult(parsed, args);
        case 'search_files':
          return this.formatSearchFilesResult(parsed, args);
        case 'search_in_files':
          return this.formatSearchInFilesResult(parsed, args);
        case 'read_code_element':
          return this.formatReadCodeElementResult(parsed, args);
        case 'search_with_context':
          return this.formatSearchWithContextResult(parsed, args);
        case 'replace_in_file':
          return this.formatReplaceInFileResult(parsed, args);
        case 'find_similar_code':
          return this.formatFindSimilarCodeResult(parsed, args);
        case 'explore_codebase':
          return this.formatExploreCodebaseResult(parsed, args);
        case 'code_vectorization_status':
          return this.formatCodeVectorizationStatusResult(parsed, args);
        case 'dependency_query':
          return this.formatDependencyQueryResult(parsed, args);
        case 'dependency_path':
          return this.formatDependencyPathResult(parsed, args);
        case 'dependency_stats':
          return this.formatDependencyStatsResult(parsed, args);
        case 'dependency_impact':
          return this.formatDependencyImpactResult(parsed, args);
        case 'circular_dependencies':
          return this.formatCircularDependenciesResult(parsed, args);
        default:
          return `\n\n**Tool Result (${toolName}):**\n\`\`\`json\n${result}\n\`\`\``;
      }
    } catch (error) {
      // If parsing fails, show raw result
      return `\n\n**Tool Result (${toolName}):**\n\`\`\`json\n${result}\n\`\`\``;
    }
  }

  private formatListFilesResult(parsed: any, args: any): string {
    const path = parsed.path || args.path || '.';
    const isRecursive = parsed.recursive || args.recursive;
    
    let output = `\n\n### 📁 Files in \`${path}\`${isRecursive ? ' (recursive)' : ''}\n\n`;
    
    if (parsed.entries && parsed.entries.length > 0) {
      if (isRecursive) {
        // For recursive listing, show tree-like structure
        output += this.formatRecursiveFileTree(parsed.entries);
      } else {
        // Non-recursive listing (existing logic)
        const directories = parsed.entries.filter((entry: any) => entry.type === 'directory');
        const files = parsed.entries.filter((entry: any) => entry.type === 'file');
        
        // Show directories first
        if (directories.length > 0) {
          output += `**📂 Directories (${directories.length}):**\n`;
          for (const dir of directories) {
            output += `- 📁 \`${dir.name}/\`\n`;
          }
          output += '\n';
        }
        
        // Show files
        if (files.length > 0) {
          output += `**📄 Files (${files.length}):**\n`;
          for (const file of files) {
            const icon = this.getFileIcon(file.name);
            output += `- ${icon} \`${file.name}\`\n`;
          }
          output += '\n';
        }
      }
      
      output += `*Total: ${parsed.total_count} items*`;
    } else {
      output += '*No files found*';
    }
    
    return output;
  }

  private formatRecursiveFileTree(entries: any[]): string {
    let output = '';
    
    // Group by directory structure
    const tree: { [key: string]: any[] } = {};
    
    for (const entry of entries) {
      const parts = entry.name.split('/');
      const depth = parts.length - 1;
      
      // Create indentation based on depth
      const indent = '  '.repeat(depth);
      const name = parts[parts.length - 1];
      
      if (entry.type === 'directory') {
        output += `${indent}📁 \`${name}/\`\n`;
      } else {
        const icon = this.getFileIcon(name);
        output += `${indent}${icon} \`${name}\`\n`;
      }
    }
    
    return output + '\n';
  }

  private formatReadFileResult(parsed: any, args: any): string {
    const filePath = parsed.path || args.path;
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    const language = this.getLanguageFromExtension(extension);
    
    let output = `\n\n### 📄 File: \`${filePath}\`\n\n`;
    
    if (parsed.content) {
      const contentLength = parsed.content.length;
      const totalSize = parsed.totalSize || contentLength;
      
      // Show file info
      if (totalSize > contentLength) {
        output += `*Showing ${contentLength} of ${totalSize} characters*\n\n`;
      }
      
      // Show content with syntax highlighting
      output += `\`\`\`${language}\n${parsed.content}\n\`\`\``;
    } else {
      output += '*File is empty*';
    }
    
    return output;
  }

  private formatReplaceTextResult(parsed: any, args: any): string {
    const filePath = parsed.path || args.path;
    
    let output = `\n\n### ✏️ Text Replacement in \`${filePath}\`\n\n`;
    
    if (parsed.replaced) {
      output += `✅ **Successfully replaced text**\n\n`;
      output += `**Position:** Character ${parsed.position}\n`;
      output += `**Old text length:** ${parsed.oldLength} characters\n`;
      output += `**New text length:** ${parsed.newLength} characters\n`;
      
      const delta = parsed.newLength - parsed.oldLength;
      if (delta > 0) {
        output += `**Change:** +${delta} characters\n`;
      } else if (delta < 0) {
        output += `**Change:** ${delta} characters\n`;
      } else {
        output += `**Change:** No size change\n`;
      }
    } else {
      output += `❌ **Failed to replace text**\n`;
    }
    
    return output;
  }

  private formatExecCommandResult(parsed: any, args: any): string {
    const cmd = parsed.cmd || args.cmd;
    const cwd = parsed.cwd || args.cwd || '.';
    const exitCode = parsed.exitCode || 0;
    
    let output = `\n\n### 🖥️ Command: \`${cmd}\`\n\n`;
    output += `**Working directory:** \`${cwd}\`\n`;
    output += `**Exit code:** ${exitCode === 0 ? '✅ 0 (success)' : `❌ ${exitCode} (error)`}\n\n`;
    
    if (parsed.stdout && parsed.stdout.trim()) {
      output += `**Output:**\n\`\`\`\n${parsed.stdout}\n\`\`\`\n`;
    }
    
    if (parsed.stderr && parsed.stderr.trim()) {
      output += `**Error output:**\n\`\`\`\n${parsed.stderr}\n\`\`\`\n`;
    }
    
    if (!parsed.stdout?.trim() && !parsed.stderr?.trim()) {
      output += `*No output*`;
    }
    
    return output;
  }

  private getFileIcon(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    const iconMap: { [key: string]: string } = {
      // Code files
      'js': '🟨', 'jsx': '🟨', 'ts': '🔵', 'tsx': '🔵',
      'py': '🐍', 'java': '☕', 'cpp': '⚡', 'c': '⚡',
      'go': '🐹', 'rs': '🦀', 'php': '🐘', 'rb': '💎',
      'swift': '🐦', 'kt': '🟣', 'dart': '🎯',
      
      // Web files
      'html': '🌐', 'css': '🎨', 'scss': '🎨', 'less': '🎨',
      'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋',
      
      // Documents
      'md': '📝', 'txt': '📄', 'pdf': '📕', 'doc': '📘', 'docx': '📘',
      
      // Images
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
      'ico': '🖼️', 'webp': '🖼️',
      
      // Config files
      'gitignore': '🚫', 'env': '🔐', 'config': '⚙️', 'conf': '⚙️',
      'lock': '🔒', 'log': '📊'
    };
    
    return iconMap[extension] || '📄';
  }

  private getLanguageFromExtension(extension: string): string {
    const langMap: { [key: string]: string } = {
      'js': 'javascript', 'jsx': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python', 'java': 'java', 'cpp': 'cpp', 'c': 'c',
      'go': 'go', 'rs': 'rust', 'php': 'php', 'rb': 'ruby',
      'swift': 'swift', 'kt': 'kotlin', 'dart': 'dart',
      'html': 'html', 'css': 'css', 'scss': 'scss',
      'json': 'json', 'xml': 'xml', 'yaml': 'yaml', 'yml': 'yaml',
      'md': 'markdown', 'txt': 'text', 'sh': 'bash',
      'sql': 'sql', 'dockerfile': 'dockerfile'
    };
    
    return langMap[extension] || 'text';
  }

  private formatSearchCodeResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Search Code Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 🔍 Code Search Results for "${args.query}"\n\n`;
    
    if (!parsed.results || parsed.results.length === 0) {
      output += '*No results found*';
      return output;
    }

    output += `Found ${parsed.totalResults} matches:\n\n`;

    for (const result of parsed.results) {
      const icon = this.getFileIcon(result.file);
      output += `#### ${icon} \`${result.file}\` (${result.lines})\n`;
      
      if (result.type && result.name) {
        output += `**${result.type}:** \`${result.name}\``;
        if (result.score) {
          output += ` *(similarity: ${result.score})*`;
        }
        output += '\n';
      }
      
      if (result.description) {
        output += `*${result.description}*\n`;
      }
      
      output += `\`\`\`${result.language || 'text'}\n${result.content}\n\`\`\`\n\n`;
    }

    return output;
  }

  private formatSearchFilesResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ File Search Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 📂 File Search Results for "${args.query}"\n\n`;
    
    if (!parsed.results || parsed.results.length === 0) {
      output += '*No files found*';
      return output;
    }

    output += `Found ${parsed.totalResults} files`;
    if (parsed.totalMatched && parsed.totalMatched !== parsed.totalResults) {
      output += ` (showing first ${parsed.totalResults})`;
    }
    output += ':\n\n';

    for (const file of parsed.results) {
      const icon = file.type === 'directory' ? '📁' : this.getFileIcon(file.name);
      output += `- ${icon} \`${file.path}\``;
      
      if (file.size) {
        output += ` *(${file.size})*`;
      }
      
      output += '\n';
    }

    if (parsed.filesSearched) {
      output += `\n*Searched ${parsed.filesSearched} files*`;
    }

    return output;
  }

  private formatSearchInFilesResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ In-File Search Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 🔎 In-File Search Results for "${args.query}"\n`;
    
    if (args.caseSensitive) output += `*(case sensitive)*\n`;
    if (args.useRegex) output += `*(regex mode)*\n`;
    output += '\n';
    
    if (!parsed.results || parsed.results.length === 0) {
      output += '*No matches found*';
      return output;
    }

    output += `Found ${parsed.totalMatches} matches in ${parsed.totalFiles} files:\n\n`;

    for (const result of parsed.results) {
      const icon = this.getFileIcon(result.file.name);
      output += `#### ${icon} \`${result.file.path}\` (${result.matches.length} matches)\n\n`;
      
      for (const match of result.matches) {
        output += `Line ${match.lineNumber}: `;
        
        // Highlight the match in the line
        const before = match.lineContent.substring(0, match.matchStart);
        const matchText = match.matchText || match.lineContent.substring(match.matchStart, match.matchEnd);
        const after = match.lineContent.substring(match.matchEnd);
        
        output += `\`${before}**${matchText}**${after}\`\n`;
      }
      
      output += '\n';
    }

    if (parsed.filesSearched) {
      output += `*Searched ${parsed.filesSearched} files*`;
    }

    return output;
  }

  private formatReadCodeElementResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Read Code Element Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    const icon = this.getFileIcon(parsed.filePath);
    let output = `\n\n### ${icon} Code from \`${parsed.filePath}\``;
    
    if (parsed.element) {
      output += `\n\n**${parsed.element.type}:** \`${parsed.element.name}\` (lines ${parsed.element.startLine}-${parsed.element.endLine})`;
      
      if (parsed.element.parameters && parsed.element.parameters.length > 0) {
        output += `\n**Parameters:** ${parsed.element.parameters.join(', ')}`;
      }
      
      if (parsed.element.returnType) {
        output += `\n**Returns:** ${parsed.element.returnType}`;
      }
      
      if (parsed.element.jsdoc) {
        output += `\n\n*${parsed.element.jsdoc}*`;
      }
      
      output += `\n\n\`\`\`${parsed.element.language || 'text'}\n${parsed.element.content}\n\`\`\``;
      
      if (parsed.relatedElements && parsed.relatedElements.length > 0) {
        output += '\n\n**Related elements:**\n';
        for (const related of parsed.relatedElements) {
          if (related.type === 'parent') {
            output += `- Parent ${related.element.type}: \`${related.element.name}\`\n`;
          }
        }
      }
    } else if (parsed.context) {
      output += ` (context around line ${parsed.lineNumber})\n\n`;
      output += `\`\`\`${this.getLanguageFromExtension(parsed.filePath.split('.').pop() || '')}\n${parsed.context.content}\n\`\`\``;
    }

    return output;
  }

  private formatSearchWithContextResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Search with Context Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 🔍 Context-Aware Search Results for "${args.query}"\n\n`;
    
    if (!parsed.results || parsed.results.length === 0) {
      output += '*No matches found*';
      return output;
    }

    output += `Found ${parsed.totalMatches} matches in ${parsed.totalFiles} files`;
    
    if (parsed.codeElementTypes) {
      const types = Object.entries(parsed.codeElementTypes)
        .map(([type, count]) => `${count} ${type}${(count as number) > 1 ? 's' : ''}`)
        .join(', ');
      output += ` (${types})`;
    }
    
    output += ':\n\n';

    for (const result of parsed.results) {
      const icon = this.getFileIcon(result.file.name);
      output += `#### ${icon} \`${result.file.path}\`\n\n`;
      
      for (const match of result.matches) {
        if (match.codeElement) {
          output += `**${match.codeElement.type}:** \`${match.codeElement.name}\` `;
          output += `(lines ${match.codeElement.startLine}-${match.codeElement.endLine})\n`;
        }
        
        output += `Line ${match.lineNumber}: \`${match.lineContent}\`\n\n`;
      }
    }

    return output;
  }

  private formatReplaceInFileResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Replace in File Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    const icon = this.getFileIcon(parsed.filePath);
    let output = `\n\n### ✏️ Text Replacement in ${icon} \`${parsed.filePath}\`\n\n`;
    
    if (parsed.modified) {
      output += `✅ **Successfully replaced ${parsed.replacementCount} occurrence${parsed.replacementCount !== 1 ? 's' : ''}**\n\n`;
      output += `**Search text:** \`${parsed.searchText}\`\n`;
      output += `**Replace text:** \`${parsed.replaceText || '(empty)'}\`\n`;
      
      if (args.caseSensitive) output += `**Case sensitive:** Yes\n`;
      if (args.useRegex) output += `**Regex mode:** Yes\n`;
      output += `**Replace all:** ${parsed.replaceAll ? 'Yes' : 'No'}\n`;
    } else {
      output += `ℹ️ **No replacements made** - text not found\n`;
    }

    return output;
  }

  private formatFindSimilarCodeResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Find Similar Code Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 🔍 Similar Code Results\n\n`;
    
    if (!parsed.results || parsed.results.length === 0) {
      output += '*No similar code found*';
      return output;
    }

    output += `Found ${parsed.totalResults} similar code snippets:\n\n`;
    
    // Show the original snippet
    output += `**Original snippet:**\n\`\`\`\n${args.codeSnippet}\n\`\`\`\n\n`;
    
    output += `**Similar code:**\n\n`;

    for (const result of parsed.results) {
      const icon = this.getFileIcon(result.file);
      output += `#### ${icon} \`${result.file}\` (${result.lines})`;
      
      if (result.score) {
        output += ` - *Similarity: ${result.score}*`;
      }
      
      output += '\n';
      
      if (result.type && result.name) {
        output += `**${result.type}:** \`${result.name}\`\n`;
      }
      
      output += `\`\`\`${result.language || 'text'}\n${result.content}\n\`\`\`\n\n`;
    }

    return output;
  }

  private formatExploreCodebaseResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Explore Codebase Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 🗺️ Codebase Exploration`;
    
    if (args.action) {
      output += ` - ${args.action.replace(/_/g, ' ')}`;
    }
    
    output += '\n\n';

    if (parsed.results && Array.isArray(parsed.results)) {
      for (const item of parsed.results) {
        if (typeof item === 'string') {
          output += `- ${item}\n`;
        } else if (item.name) {
          const icon = item.type === 'file' ? this.getFileIcon(item.name) : '📁';
          output += `- ${icon} \`${item.name}\``;
          
          if (item.type) output += ` (${item.type})`;
          if (item.language) output += ` [${item.language}]`;
          if (item.lines) output += ` ${item.lines} lines`;
          
          output += '\n';
        }
      }
      
      output += `\n*Total: ${parsed.results.length} items*`;
    } else if (parsed.structure) {
      // File structure output
      output += this.formatCodeStructure(parsed.structure);
    }

    return output;
  }

  private formatCodeStructure(structure: any): string {
    let output = '';
    
    if (structure.classes && structure.classes.length > 0) {
      output += `**Classes (${structure.classes.length}):**\n`;
      for (const cls of structure.classes) {
        output += `- 🏛️ \`${cls.name}\``;
        if (cls.lines) output += ` (lines ${cls.lines})`;
        output += '\n';
      }
      output += '\n';
    }
    
    if (structure.functions && structure.functions.length > 0) {
      output += `**Functions (${structure.functions.length}):**\n`;
      for (const func of structure.functions) {
        output += `- ⚡ \`${func.name}\``;
        if (func.lines) output += ` (lines ${func.lines})`;
        output += '\n';
      }
      output += '\n';
    }
    
    if (structure.imports && structure.imports.length > 0) {
      output += `**Imports (${structure.imports.length}):**\n`;
      for (const imp of structure.imports) {
        output += `- 📦 \`${imp}\`\n`;
      }
      output += '\n';
    }
    
    return output;
  }

  private formatCodeVectorizationStatusResult(parsed: any, args: any): string {
    if (!parsed.success) {
      return `\n\n### ❌ Code Vectorization Error\n\n${parsed.error || 'Unknown error occurred'}`;
    }

    let output = `\n\n### 📊 Code Vectorization Status\n\n`;

    if (parsed.status) {
      const status = parsed.status;
      
      output += `**Status:** ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}\n`;
      output += `**Total files:** ${status.totalFiles}\n`;
      output += `**Processed files:** ${status.processedFiles}\n`;
      output += `**Total code elements:** ${status.totalElements}\n`;
      
      if (status.progress !== undefined) {
        const progressBar = this.createProgressBar(status.progress);
        output += `**Progress:** ${progressBar} ${Math.round(status.progress)}%\n`;
      }
      
      if (status.lastUpdate) {
        output += `**Last update:** ${new Date(status.lastUpdate).toLocaleString()}\n`;
      }
      
      if (status.errors && status.errors > 0) {
        output += `**Errors:** ⚠️ ${status.errors}\n`;
      }
    }

    if (parsed.message) {
      output += `\n*${parsed.message}*`;
    }

    return output;
  }

  private formatDependencyQueryResult(parsed: any, args: any): string {
    const filePath = args.filePath || 'Unknown file';
    
    if (!parsed.found) {
      return `\n\n### 🔍 Dependency Query: \`${filePath}\`\n\n❌ ${parsed.message || 'File not found in dependency graph'}`;
    }

    let output = `\n\n### 🔍 Dependency Query: \`${filePath}\`\n\n`;
    output += `**Language:** ${parsed.language}\n`;
    output += `**Summary:**\n`;
    output += `- 📥 **Imports:** ${parsed.summary.imports} files\n`;
    output += `- 📤 **Exports:** ${parsed.summary.exports} symbols\n`;
    output += `- 📎 **Dependents:** ${parsed.summary.dependents} files\n\n`;

    if (parsed.dependencies.imports.length > 0) {
      output += `**Imports (${parsed.dependencies.imports.length}):**\n`;
      for (const imp of parsed.dependencies.imports) {
        output += `- \`${imp.name}\` (${imp.path})\n`;
      }
      output += '\n';
    }

    if (parsed.dependencies.exports.length > 0) {
      output += `**Exports (${parsed.dependencies.exports.length}):**\n`;
      for (const exp of parsed.dependencies.exports) {
        output += `- \`${exp}\`\n`;
      }
      output += '\n';
    }

    if (parsed.dependencies.dependents.length > 0) {
      output += `**Dependent Files (${parsed.dependencies.dependents.length}):**\n`;
      for (const dep of parsed.dependencies.dependents) {
        output += `- \`${dep.name}\` (${dep.path})\n`;
      }
    }

    return output;
  }

  private formatDependencyPathResult(parsed: any, args: any): string {
    const fromFile = args.fromFile || 'Unknown';
    const toFile = args.toFile || 'Unknown';

    let output = `\n\n### 🛤️ Dependency Path: \`${fromFile}\` → \`${toFile}\`\n\n`;

    if (!parsed.pathExists) {
      output += `❌ No dependency path found between these files.\n`;
      return output;
    }

    if (parsed.path && parsed.path.length > 0) {
      output += `✅ **Path found (${parsed.path.length} steps):**\n\n`;
      for (let i = 0; i < parsed.path.length; i++) {
        const file = parsed.path[i];
        output += `${i + 1}. \`${file.name}\` (${file.path})`;
        if (i < parsed.path.length - 1) {
          output += ' →';
        }
        output += '\n';
      }
    }

    return output;
  }

  private formatDependencyStatsResult(parsed: any, args: any): string {
    if (!parsed.available) {
      return `\n\n### 📊 Dependency Statistics\n\n❌ ${parsed.message || 'No dependency statistics available'}`;
    }

    let output = `\n\n### 📊 Dependency Statistics\n\n`;
    
    if (parsed.overview) {
      output += `**Overview:**\n`;
      output += `- 📁 **Total Files:** ${parsed.overview.totalFiles}\n`;
      output += `- 🔗 **Total Dependencies:** ${parsed.overview.totalDependencies}\n`;
      output += `- 🔄 **Circular Dependencies:** ${parsed.overview.circularDependencyCount}\n\n`;
    }

    if (parsed.mostDependent && parsed.mostDependent.length > 0) {
      output += `**Most Dependent Files (highest imports):**\n`;
      for (const file of parsed.mostDependent) {
        output += `- \`${file.file}\` - ${file.imports} imports\n`;
      }
      output += '\n';
    }

    if (parsed.mostDependedOn && parsed.mostDependedOn.length > 0) {
      output += `**Most Depended On Files (most dependents):**\n`;
      for (const file of parsed.mostDependedOn) {
        output += `- \`${file.file}\` - ${file.dependents} dependents\n`;
      }
      output += '\n';
    }

    if (parsed.circularDependencies && parsed.circularDependencies.length > 0) {
      output += `**⚠️ Circular Dependencies (${parsed.circularDependencies.length}):**\n`;
      for (const cycle of parsed.circularDependencies) {
        output += `- ${cycle.summary}\n`;
      }
    }

    return output;
  }

  private formatDependencyImpactResult(parsed: any, args: any): string {
    const filePath = args.filePath || 'Unknown file';

    let output = `\n\n### 💥 Dependency Impact Analysis: \`${filePath}\`\n\n`;

    if (!parsed.found) {
      output += `❌ File not found in dependency graph\n`;
      return output;
    }

    if (parsed.impact) {
      output += `**Direct Impact:**\n`;
      output += `- 🎯 **Direct dependents:** ${parsed.impact.directDependents}\n`;
      output += `- 📊 **Total affected files:** ${parsed.impact.totalAffected}\n`;
      output += `- 🏗️ **Max dependency depth:** ${parsed.impact.maxDepth}\n\n`;

      if (parsed.impact.affectedByLevel) {
        output += `**Impact by Depth Level:**\n`;
        for (const [level, count] of Object.entries(parsed.impact.affectedByLevel)) {
          output += `- Level ${level}: ${count} files\n`;
        }
        output += '\n';
      }

      if (parsed.impact.criticalFiles && parsed.impact.criticalFiles.length > 0) {
        output += `**⚠️ Critical Files Affected:**\n`;
        for (const file of parsed.impact.criticalFiles) {
          output += `- \`${file.name}\` (${file.path}) - ${file.reason}\n`;
        }
      }
    }

    return output;
  }

  private formatCircularDependenciesResult(parsed: any, args: any): string {
    let output = `\n\n### 🔄 Circular Dependencies Analysis\n\n`;

    if (parsed.count === 0) {
      output += parsed.message || '✅ No circular dependencies found!\n';
      return output;
    }

    output += parsed.message || `⚠️ Found ${parsed.count} circular dependency cycles.\n\n`;

    if (parsed.severity) {
      output += `**Overall Severity:** ${parsed.severity.toUpperCase()}\n`;
    }

    if (parsed.breakdown) {
      output += `**Breakdown:**\n`;
      output += `- 🔴 High severity: ${parsed.breakdown.high}\n`;
      output += `- 🟡 Medium severity: ${parsed.breakdown.medium}\n`;
      output += `- 🟢 Low severity: ${parsed.breakdown.low}\n\n`;
    }

    if (parsed.cycles && parsed.cycles.length > 0) {
      output += `**Circular Dependency Cycles:**\n`;
      for (let i = 0; i < Math.min(10, parsed.cycles.length); i++) {
        const cycle = parsed.cycles[i];
        output += `${i + 1}. ${cycle.flowSummary}\n`;
      }
      if (parsed.cycles.length > 10) {
        output += `... and ${parsed.cycles.length - 10} more cycles\n`;
      }
      output += '\n';
    }

    if (parsed.details && parsed.details.length > 0) {
      output += `**Detailed Analysis:**\n`;
      for (const detail of parsed.details.slice(0, 5)) {
        output += `\n**${detail.severity.toUpperCase()} - ${detail.description}**\n`;
        if (detail.recommendations && detail.recommendations.length > 0) {
          for (const rec of detail.recommendations) {
            output += `  ${rec}\n`;
          }
        }
      }
      output += '\n';
    }

    if (parsed.recommendations && parsed.recommendations.length > 0) {
      output += `**General Recommendations:**\n`;
      for (const rec of parsed.recommendations) {
        output += `${rec}\n`;
      }
    }

    return output;
  }

  private createProgressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private formatToolName(toolName: string): string {
    const toolDisplayNames: { [key: string]: string } = {
      'listFiles': 'List Files',
      'readFile': 'Read File',
      'replaceText': 'Replace Text',
      'execCommand': 'Execute Command',
      'search_code': 'Code Search',
      'search_files': 'File Search',
      'search_in_files': 'In-File Search',
      'read_code_element': 'Read Code Element',
      'search_with_context': 'Context Search',
      'replace_in_file': 'Replace in File',
      'find_similar_code': 'Find Similar Code',
      'explore_codebase': 'Explore Codebase',
      'code_vectorization_status': 'Vectorization Status',
      'dependency_query': 'Dependency Query',
      'dependency_path': 'Dependency Path',
      'dependency_stats': 'Dependency Statistics',
      'dependency_impact': 'Dependency Impact',
      'circular_dependencies': 'Circular Dependencies'
    };
    
    return toolDisplayNames[toolName] || toolName;
  }

  /**
   * Process tool results intelligently - decide whether to display them or use them for further reasoning
   */
  private async processToolResults(
    toolResults: Array<{
      toolCall: any;
      result?: string;
      error?: string;
      success: boolean;
    }>,
    originalMessages: any[],
    modelWithTools: any,
    currentContent: string
  ): Promise<string> {
    // Get the original user message to understand the intent
    const userMessage = originalMessages[originalMessages.length - 1];
    const userContent = userMessage.content.toLowerCase();
    
    // Determine if this is a processing request (summary, analysis, etc.) or a display request
    const isProcessingRequest = this.isProcessingRequest(userContent);
    
    if (isProcessingRequest) {
      console.log('[LANGCHAIN] Detected processing request, sending tool results back to model for reasoning');
      return await this.processToolResultsWithModel(toolResults, originalMessages, modelWithTools, currentContent);
    } else {
      console.log('[LANGCHAIN] Detected display request, formatting tool results for presentation');
      return this.formatToolResultsForDisplay(toolResults, currentContent);
    }
  }

  /**
   * Check if the user request requires processing the tool results rather than just displaying them
   */
  private isProcessingRequest(userContent: string): boolean {
    const processingKeywords = [
      'summarize', 'summary', 'explain', 'analyze', 'analysis', 'describe',
      'what does', 'what is', 'how does', 'tell me about', 'review',
      'understand', 'interpret', 'comment on', 'evaluate', 'assess',
      'break down', 'overview', 'highlights', 'key points', 'main ideas',
      'purpose', 'function', 'meaning', 'significance', 'implications'
    ];
    
    return processingKeywords.some(keyword => userContent.includes(keyword));
  }

  /**
   * Send tool results back to the model for further reasoning and processing
   */
  private async processToolResultsWithModel(
    toolResults: Array<{
      toolCall: any;
      result?: string;
      error?: string;
      success: boolean;
    }>,
    originalMessages: any[],
    modelWithTools: any,
    currentContent: string
  ): Promise<string> {
    // Create a new message with the tool results as context
    const toolResultsContext = toolResults.map(tr => {
      if (tr.success) {
        return `Tool ${tr.toolCall.name} executed successfully. Result: ${tr.result}`;
      } else {
        return `Tool ${tr.toolCall.name} failed with error: ${tr.error}`;
      }
    }).join('\n\n');

    // Create a follow-up message to the model with the tool results
    const followUpMessages = [
      ...originalMessages,
      {
        role: 'assistant',
        content: `I have executed the necessary tools. Here are the results:\n\n${toolResultsContext}\n\nBased on these results, I'll now provide you with the information you requested.`
      },
      {
        role: 'user',
        content: 'Please process and respond to my original request using the tool results you just obtained.'
      }
    ];

    try {
      // Send the follow-up request to the model WITHOUT tools to get a processed response
      const followUpResponse = await modelWithTools.invoke(followUpMessages);
      
      // Combine the current content with the processed response
      return currentContent + '\n\n' + followUpResponse.content.toString();
    } catch (error) {
      console.error('[LANGCHAIN] Error in follow-up processing:', error);
      // Fallback to displaying the tool results
      return this.formatToolResultsForDisplay(toolResults, currentContent);
    }
  }

  /**
   * Format tool results for direct display (when user wants to see the raw results)
   */
  private formatToolResultsForDisplay(
    toolResults: Array<{
      toolCall: any;
      result?: string;
      error?: string;
      success: boolean;
    }>,
    currentContent: string
  ): string {
    let finalContent = currentContent;
    
    for (const toolResult of toolResults) {
      if (toolResult.success) {
        finalContent += this.formatToolResult(toolResult.toolCall.name, toolResult.result!, toolResult.toolCall.args);
      } else {
        finalContent += `\n\n**Tool Error (${toolResult.toolCall.name}):** ${toolResult.error}`;
      }
    }
    
    return finalContent;
  }
}

// Singleton instance
let langChainChatServiceInstance: LangChainChatService | null = null;

export function getLangChainChatService(): LangChainChatService {
  if (!langChainChatServiceInstance) {
    langChainChatServiceInstance = new LangChainChatService();
  }
  return langChainChatServiceInstance;
}