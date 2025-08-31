# MCP Agent Setup

This app preconfigures an MCP Filesystem server so agents (e.g., Claude Desktop or MCP‑aware tools) can access your local files safely.

## Quick Start
- Install and configure: `npm run setup` (creates `.env`, installs deps).
- Launch once: `npm start`. On first run, the app generates a Gemini CLI MCP config.
- Verify config: `gemini-cli-local/.gemini/mcp_servers.json` should contain a `filesystem` entry.

Example snippet:
```json
{
  "filesystem": {
    "command": "node",
    "args": [
      "<repo>/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js",
      "/Users/<you>"  
    ],
    "env": {}
  }
}
```

## How It Works
- `src/mcp-config-generator.ts` writes `mcp_servers.json` so Gemini CLI knows how to launch the Filesystem server.
- Base path defaults to your OS home directory for convenient access to Desktop/Downloads. Edit `ensureMCPConfig` if you need to restrict scope.

## Using With Agents
- Start the desktop app (`npm start`) so Gemini CLI has valid auth and the MCP config exists.
- Point your MCP‑aware client to the Gemini CLI (or ensure it reads the same MCP config).
- Test with local PDFs (e.g., `test-pdfs/`) and verify the agent can list/read files under the configured base path.

## Safety Tips
- Keep `.gemini/` out of version control.
- Avoid granting broader access than required. If needed, change the base path to a dedicated workspace folder.
