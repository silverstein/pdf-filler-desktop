// MCP Manager - Handles Model Context Protocol servers
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

class MCPManager {
  constructor() {
    this.servers = {};
  }

  async startFilesystemServer() {
    // Determine if we're in production or development
    const isProduction = __dirname.includes('app.asar');
    
    // In production, use Electron's bundled Node.js to run the MCP server
    const nodePath = process.execPath; // This is the Electron executable which includes Node
    
    // Find the MCP server module
    let mcpServerPath;
    if (isProduction) {
      // In production, modules are in app.asar or app.asar.unpacked
      const basePath = __dirname.replace('app.asar', 'app.asar.unpacked');
      mcpServerPath = path.join(basePath, '../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js');
    } else {
      // In development, use regular node_modules
      mcpServerPath = path.join(__dirname, '../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js');
    }
    
    // Check if MCP server exists
    try {
      await fs.access(mcpServerPath);
      console.log('MCP filesystem server found at:', mcpServerPath);
    } catch (error) {
      console.error('MCP filesystem server not found:', error);
      return false;
    }
    
    // Start the MCP server using Electron's Node runtime
    // For now, just give access to project directory and temp files
    const projectDir = path.join(__dirname, '..');
    
    this.servers.filesystem = spawn(nodePath, [mcpServerPath, projectDir], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1' // Tell Electron to run as plain Node.js
      }
    });
    
    this.servers.filesystem.stdout.on('data', (data) => {
      console.log(`MCP filesystem: ${data}`);
    });
    
    this.servers.filesystem.stderr.on('data', (data) => {
      console.error(`MCP filesystem error: ${data}`);
    });
    
    this.servers.filesystem.on('error', (error) => {
      console.error('Failed to start MCP filesystem server:', error);
    });
    
    console.log('MCP filesystem server started');
    return true;
  }
  
  async stopAll() {
    for (const [name, server] of Object.entries(this.servers)) {
      if (server && !server.killed) {
        console.log(`Stopping MCP server: ${name}`);
        server.kill();
      }
    }
  }
}

module.exports = MCPManager;