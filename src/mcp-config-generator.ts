import path from 'path';
import { promises as fs } from 'fs';

export async function ensureMCPConfig(): Promise<void> {
  const mcpConfigPath = path.join(__dirname, '../gemini-cli-local/.gemini/mcp_servers.json');
  
  try {
    // Check if config already exists
    await fs.access(mcpConfigPath);
    console.log('MCP config already exists');
  } catch {
    // Create MCP config
    const mcpConfig = {
      "filesystem": {
        "command": "npx",
        "args": [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          path.join(__dirname, '..')
        ]
      }
    };
    
    // Ensure directory exists
    const mcpDir = path.dirname(mcpConfigPath);
    await fs.mkdir(mcpDir, { recursive: true });
    
    // Write config
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log('MCP config created');
  }
}

export default { ensureMCPConfig };