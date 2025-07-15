#!/usr/bin/env node

/**
 * Test script for LabRats MCP Server
 * Run with: npx tsx src/services/mcp/test-server.ts
 */

import { LabRatsMcpServer } from './labrats-mcp-server';
import * as path from 'path';

async function testServer() {
  const projectRoot = path.resolve(__dirname, '../../..'); // Point to project root
  
  console.log('Starting LabRats MCP Server for testing...');
  console.log(`Project root: ${projectRoot}`);
  
  const server = new LabRatsMcpServer({
    projectRoot,
    name: 'labrats-mcp-test',
    version: '1.0.0'
  });

  try {
    await server.start();
    console.log('Server started successfully!');
    console.log('The server is now waiting for MCP client connections...');
    console.log('Press Ctrl+C to stop the server.');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    process.exit(0);
  });
}

// Run the test
testServer();