import path from 'path';
import { promises as fs } from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class MCPManager {
  private mcpProcess: ChildProcess | null = null;
  private mcpConfigPath: string;

  constructor() {
    this.mcpConfigPath = path.join(__dirname, '../gemini-cli-local/.gemini/mcp_servers.json');
  }

  async initialize(): Promise<boolean> {
    try {
      // Check if MCP config exists
      await fs.access(this.mcpConfigPath);
      console.log('MCP configuration found');
      
      // MCP is already configured through the Gemini CLI
      // No need to spawn separate process
      return true;
    } catch {
      console.log('MCP configuration not found, skipping MCP initialization');
      return false;
    }
  }

  cleanup(): void {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
  }
}

export default MCPManager;