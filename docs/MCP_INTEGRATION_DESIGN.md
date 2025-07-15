# MCP Integration Design for LabRats.AI

## Overview

This document outlines the design for integrating Model Context Protocol (MCP) into LabRats.AI, enabling agents to access project files and perform IDE-like operations through a standardized protocol.

## Architecture

### MCP Server Component

The LabRats MCP server will be implemented as a service that:
1. Runs within the Electron main process
2. Exposes file system tools to MCP clients (our agents)
3. Enforces security boundaries (project directory only)
4. Integrates with existing LabRats services

### Server Structure

```
src/
├── services/
│   └── mcp/
│       ├── labrats-mcp-server.ts      # Main MCP server implementation
│       ├── tools/                     # Tool implementations
│       │   ├── file-tools.ts          # File system tools
│       │   ├── git-tools.ts           # Git operations (future)
│       │   └── project-tools.ts       # Project-specific tools (future)
│       ├── transport/
│       │   └── stdio-transport.ts     # Stdio transport adapter
│       └── security/
│           └── path-validator.ts      # Path validation and sandboxing
```

## Tool Design

### 1. list_files Tool

**Purpose**: List files and directories in the project with navigation capabilities

**Input Schema**:
```typescript
{
  path?: string;        // Relative path from project root (default: ".")
  recursive?: boolean;  // List recursively (default: false)
  include_hidden?: boolean; // Include hidden files (default: false)
  pattern?: string;     // Optional glob pattern filter
}
```

**Output Schema**:
```typescript
{
  path: string;         // Current directory path
  entries: Array<{
    name: string;       // File/directory name
    type: "file" | "directory";
    size?: number;      // File size in bytes
    modified?: string;  // ISO timestamp
    permissions?: string; // File permissions
  }>;
  total_count: number;
}
```

### Security Considerations

1. **Path Sandboxing**: All paths are restricted to project directory
2. **Path Validation**: Prevent directory traversal attacks
3. **Permission Checks**: Respect file system permissions
4. **Ignore Files**: Respect .gitignore and .labrats-ignore

## Integration Points

### 1. Agent Message Bus Integration

```typescript
// Agent requests file listing through MCP
const mcpClient = new McpClient(transport);
const result = await mcpClient.callTool('list_files', { 
  path: 'src/services',
  recursive: false 
});
```

### 2. Transport Layer

Initial implementation uses stdio transport for process isolation:
- MCP server runs as child process
- Communication via stdin/stdout
- JSON-RPC message format

### 3. Agent Configuration

Update agent configs to include MCP capabilities:
```typescript
export interface AgentConfig {
  // ... existing fields
  mcpEnabled?: boolean;
  mcpTools?: string[]; // List of allowed MCP tools
}
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Set up MCP server skeleton with TypeScript SDK
2. Implement stdio transport
3. Create path validation and security layer
4. Add server lifecycle management

### Phase 2: File Tools
1. Implement `list_files` tool
2. Add `read_file` tool
3. Add `search_files` tool (grep-like functionality)
4. Integrate with existing file explorer

### Phase 3: Advanced Tools
1. Git operations (status, diff, commit)
2. Code analysis tools
3. Project-specific tools (run tests, build, etc.)

## Example Usage

### Server Implementation

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listFilesTool } from "./tools/file-tools";

export class LabRatsMcpServer {
  private server: McpServer;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.server = new McpServer({
      name: "labrats-mcp-server",
      version: "1.0.0"
    });

    this.registerTools();
  }

  private registerTools() {
    // Register list_files tool
    this.server.registerTool(
      "list_files",
      {
        description: "List files and directories in the project",
        inputSchema: z.object({
          path: z.string().optional(),
          recursive: z.boolean().optional(),
          include_hidden: z.boolean().optional(),
          pattern: z.string().optional()
        })
      },
      async (params) => listFilesTool(this.projectRoot, params)
    );
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### Client Usage (from Agent)

```typescript
// In agent-message-bus.ts or similar
class AgentWithMcp {
  private mcpClient: McpClient;

  async exploreProject() {
    // List root directory
    const rootFiles = await this.mcpClient.callTool('list_files', {});
    
    // Navigate to src directory
    const srcFiles = await this.mcpClient.callTool('list_files', {
      path: 'src',
      recursive: false
    });
    
    // Search for TypeScript files
    const tsFiles = await this.mcpClient.callTool('list_files', {
      path: 'src',
      recursive: true,
      pattern: '**/*.ts'
    });
  }
}
```

## Benefits

1. **Standardized Protocol**: Agents use same protocol regardless of IDE
2. **Security**: Controlled, sandboxed file access
3. **Extensibility**: Easy to add new tools
4. **Debugging**: MCP provides request/response logging
5. **Future-Proof**: Can add resources and prompts later

## Next Steps

1. Create the MCP server structure
2. Implement the `list_files` tool
3. Add transport and security layers
4. Integrate with agent message bus
5. Test with a simple agent scenario