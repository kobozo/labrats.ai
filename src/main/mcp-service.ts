import { ipcMain } from 'electron';
import * as path from 'path';

let mcpProjectRoot: string | null = null;
let mcpServerReady = false;

export async function initializeMcpService(projectPath: string): Promise<void> {
  console.log('[MCP-SERVICE] Initializing MCP service for project:', projectPath);
  
  try {
    mcpProjectRoot = projectPath;
    mcpServerReady = true;
    console.log('[MCP-SERVICE] MCP service ready');
  } catch (error) {
    console.error('[MCP-SERVICE] Failed to initialize MCP service:', error);
    mcpServerReady = false;
    throw error;
  }
}

export function setupMcpHandlers(): void {
  // Handler to call MCP tools
  ipcMain.handle('mcp-call-tool', async (event, toolName: string, args: any) => {
    if (!mcpServerReady || !mcpProjectRoot) {
      return {
        success: false,
        error: 'MCP service not initialized'
      };
    }

    try {
      const result = await handleToolCall(toolName, args);
      return {
        success: true,
        result
      };
    } catch (error) {
      console.error(`[MCP-SERVICE] Error calling tool ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // Handler to check MCP status
  ipcMain.handle('mcp-status', async () => {
    return {
      ready: mcpServerReady,
      serverInfo: mcpServerReady ? {
        name: 'labrats-mcp-server',
        version: '1.0.0'
      } : null
    };
  });
}

// Direct tool handling
async function handleToolCall(toolName: string, args: any): Promise<any> {
  // Import the tool implementations directly
  const { listFilesTool } = await import('../services/mcp/tools/file-tools-impl');
  
  switch (toolName) {
    case 'list_files':
      return await listFilesTool(mcpProjectRoot || process.cwd(), args);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export async function shutdownMcpService(): Promise<void> {
  mcpProjectRoot = null;
  mcpServerReady = false;
}