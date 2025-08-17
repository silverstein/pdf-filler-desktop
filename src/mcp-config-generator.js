const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

async function generateMCPConfig() {
  let appPath;
  let nodeModulesPath;
  let basePath;
  
  if (app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    appPath = path.join(resourcesPath, 'app.asar.unpacked');
    nodeModulesPath = path.join(appPath, 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js');
    basePath = app.getPath('home');
  } else {
    appPath = path.join(__dirname, '..');
    nodeModulesPath = path.join(appPath, 'node_modules', '@modelcontextprotocol', 'server-filesystem', 'dist', 'index.js');
    basePath = app.getPath('home');  // Give access to home directory in development too
  }
  
  const config = {
    filesystem: {
      command: "node",
      args: [
        nodeModulesPath,
        basePath
      ],
      env: {}
    }
  };
  
  return config;
}

async function ensureMCPConfig() {
  const geminiLocalPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'gemini-cli-local')
    : path.join(__dirname, '..', 'gemini-cli-local');
    
  const geminiConfigDir = path.join(geminiLocalPath, '.gemini');
  const mcpConfigPath = path.join(geminiConfigDir, 'mcp_servers.json');
  
  try {
    await fs.mkdir(geminiConfigDir, { recursive: true });
    
    const config = await generateMCPConfig();
    await fs.writeFile(mcpConfigPath, JSON.stringify(config, null, 2));
    
    console.log('✅ Generated MCP config at:', mcpConfigPath);
    return true;
  } catch (error) {
    console.error('❌ Failed to generate MCP config:', error);
    return false;
  }
}

module.exports = {
  generateMCPConfig,
  ensureMCPConfig
};