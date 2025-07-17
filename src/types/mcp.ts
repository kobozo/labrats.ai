// Type definitions for MCP (Model Context Protocol) integration

export interface McpToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: any;
    uri?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpServerConfig {
  projectRoot: string;
  name?: string;
  version?: string;
  description?: string;
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: any; // Zod schema
  handler: (params: any) => Promise<McpToolResult>;
}

export interface McpClientConfig {
  serverPath: string;
  serverArgs?: string[];
  transport: "stdio" | "http";
}

export interface McpCapabilities {
  tools?: string[];
  resources?: string[];
  prompts?: string[];
}

// File tool specific types
export interface ListFilesParams {
  path?: string;
  recursive?: boolean;
  include_hidden?: boolean;
  pattern?: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  permissions?: string;
}

export interface ListFilesResult {
  path: string;
  entries: FileEntry[];
  total_count: number;
}