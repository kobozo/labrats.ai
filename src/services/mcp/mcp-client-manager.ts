import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export interface McpToolCall {
  tool: string;
  arguments: any;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
}

export class McpClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverProcess: ChildProcess | null = null;
  private projectRoot: string;
  private isConnected: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // For now, use tsx to run the TypeScript server directly
      const serverPath = path.join(__dirname, 'labrats-mcp-server.ts');
      
      // Create transport
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['tsx', serverPath, this.projectRoot]
      });

      // Create client
      this.client = new Client({
        name: 'labrats-agent-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect client to transport
      await this.client.connect(this.transport);
      this.isConnected = true;

      console.log('[MCP Client] Connected to MCP server');
    } catch (error) {
      console.error('[MCP Client] Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      if (this.client) {
        await this.client.close();
      }

      if (this.serverProcess) {
        this.serverProcess.kill();
      }

      this.client = null;
      this.transport = null;
      this.serverProcess = null;
      this.isConnected = false;

      console.log('[MCP Client] Disconnected from MCP server');
    } catch (error) {
      console.error('[MCP Client] Error during disconnect:', error);
    }
  }

  async callTool(toolName: string, args: any): Promise<McpToolResult> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return result as McpToolResult;
    } catch (error) {
      console.error(`[MCP Client] Tool call failed for ${toolName}:`, error);
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  async listAvailableTools(): Promise<string[]> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      const tools = await this.client.listTools();
      return tools.tools.map(tool => tool.name);
    } catch (error) {
      console.error('[MCP Client] Failed to list tools:', error);
      return [];
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance for the application
let mcpClientInstance: McpClientManager | null = null;

export function getMcpClient(projectRoot: string): McpClientManager {
  if (!mcpClientInstance) {
    mcpClientInstance = new McpClientManager(projectRoot);
  }
  return mcpClientInstance;
}