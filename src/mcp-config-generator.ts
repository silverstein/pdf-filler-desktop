import path from 'path';
import { promises as fs } from 'fs';
import { app } from 'electron';

export async function ensureMCPConfig(): Promise<void> {
  // Determine paths based on whether app is packaged
  const geminiLocalPath = app.isPackaged 
    ? path.join(process.resourcesPath!, 'app.asar.unpacked', 'gemini-cli-local')
    : path.join(__dirname, '..', 'gemini-cli-local');
    
  const mcpConfigPath = path.join(geminiLocalPath, '.gemini', 'mcp_servers.json');
  
  // Determine the MCP server module path
  const nodeModulesPath = app.isPackaged
    ? path.join(process.resourcesPath!, 'app.asar.unpacked', 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js')
    : path.join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js');
  
  // Use home directory for filesystem access (allows PDFs from Downloads, Desktop, etc.)
  const basePath = app.getPath('home');
  
  try {
    // Check if config already exists
    await fs.access(mcpConfigPath);
    console.log('MCP config already exists at:', mcpConfigPath);
  } catch {
    // Create MCP config with proper paths
    const mcpConfig = {
      "filesystem": {
        "command": "node",
        "args": [
          nodeModulesPath,
          basePath  // Give access to entire home directory
        ],
        "env": {}
      }
    };
    
    // Ensure directory exists
    const mcpDir = path.dirname(mcpConfigPath);
    await fs.mkdir(mcpDir, { recursive: true });
    
    // Write config
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log('✅ Generated MCP config at:', mcpConfigPath);
    console.log('   Filesystem access granted to:', basePath);
  }
}

export default { ensureMCPConfig };