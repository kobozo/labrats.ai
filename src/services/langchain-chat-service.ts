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