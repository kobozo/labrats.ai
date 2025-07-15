# LabRats MCP Server

This directory contains the Model Context Protocol (MCP) server implementation for LabRats.AI, enabling agents to access project files and perform IDE-like operations.

## Structure

```
mcp/
├── labrats-mcp-server.ts    # Main server implementation
├── tools/                   # Tool implementations
│   └── file-tools.ts       # File system tools (list_files, etc.)
├── transport/              # Transport layer implementations
│   └── stdio-transport.ts  # Stdio transport (planned)
├── security/               # Security and validation
│   └── path-validator.ts   # Path validation and sandboxing
└── test-server.ts          # Test script
```

## Available Tools

### list_files
Lists files and directories in the project with navigation capabilities.

**Parameters:**
- `path` (optional): Relative path from project root (default: ".")
- `recursive` (optional): List recursively (default: false)
- `include_hidden` (optional): Include hidden files (default: false)
- `pattern` (optional): Glob pattern filter

**Example:**
```json
{
  "tool": "list_files",
  "arguments": {
    "path": "src",
    "recursive": true,
    "pattern": "*.ts"
  }
}
```

## Security Features

1. **Path Sandboxing**: All file operations are restricted to the project directory
2. **Path Validation**: Prevents directory traversal attacks
3. **Ignore Patterns**: Automatically excludes sensitive directories (node_modules, .git, etc.)

## Testing

To test the MCP server standalone:

```bash
# Install dependencies if needed
npm install @modelcontextprotocol/sdk zod glob

# Run the test server
npx tsx src/services/mcp/test-server.ts
```

## Integration

The MCP server will be integrated with:
1. Agent Message Bus - for agent-to-MCP communication
2. Electron Main Process - for lifecycle management
3. Agent Configuration - to enable/disable MCP per agent

## Future Tools

- `read_file`: Read file contents
- `search_files`: Search file contents (grep-like)
- `write_file`: Write/modify files (with restrictions)
- `git_status`: Get git status
- `git_diff`: Get git diff
- `run_command`: Execute project commands (with restrictions)