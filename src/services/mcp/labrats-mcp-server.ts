import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFileTools } from "./tools/file-tools";
import { PathValidator } from "./security/path-validator";

export interface LabRatsMcpServerConfig {
  projectRoot: string;
  name?: string;
  version?: string;
}

export class LabRatsMcpServer {
  private server: McpServer;
  private projectRoot: string;
  private pathValidator: PathValidator;

  constructor(config: LabRatsMcpServerConfig) {
    this.projectRoot = config.projectRoot;
    this.pathValidator = new PathValidator(this.projectRoot);
    
    this.server = new McpServer({
      name: config.name || "labrats-mcp-server",
      version: config.version || "1.0.0"
    });

    this.registerTools();
  }

  private registerTools(): void {
    // Register file system tools
    registerFileTools(this.server, this.projectRoot, this.pathValidator);
    
    // Future: Register git tools
    // registerGitTools(this.server, this.projectRoot, this.pathValidator);
    
    // Future: Register project tools
    // registerProjectTools(this.server, this.projectRoot, this.pathValidator);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error("[MCP] LabRats MCP Server started");
    console.error(`[MCP] Project root: ${this.projectRoot}`);
  }

  async stop(): Promise<void> {
    // Cleanup if needed
    console.error("[MCP] LabRats MCP Server stopped");
  }
}

// Main entry point for standalone server
async function main() {
  const projectRoot = process.argv[2] || process.cwd();
  
  const server = new LabRatsMcpServer({
    projectRoot,
    name: "labrats-mcp-server",
    version: "1.0.0"
  });

  try {
    await server.start();
  } catch (error) {
    console.error("[MCP] Failed to start server:", error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

// Run if called directly
if (require.main === module) {
  main();
}