// src/codex-config-generator.ts
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { app } from 'electron';

/**
 * Ensure ~/.codex/config.toml contains a stdio MCP entry for our PDF server.
 * - Packaged app: points to app.asar.unpacked/dist/mcp/pdf-filler-mcp.js
 * - Dev app: points to dist/mcp/pdf-filler-mcp.js
 *
 * We avoid TOML parsing dependencies by idempotently appending a distinct block.
 * If you prefer full merging, swap to @iarna/toml later.
 */
export async function ensureCodexConfig(): Promise<void> {
  const home = app.getPath('home') || os.homedir();
  const codexHome = path.join(home, '.codex');
  const configPath = path.join(codexHome, 'config.toml');

  // Resolve the absolute JS file path for our MCP server
  const serverJs = app.isPackaged
    ? path.join(process.resourcesPath!, 'app.asar.unpacked', 'dist', 'mcp', 'pdf-filler-mcp.js')
    : path.join(__dirname, 'mcp', 'pdf-filler-mcp.js');

  await fs.mkdir(codexHome, { recursive: true });

  let existing = '';
  try {
    existing = await fs.readFile(configPath, 'utf8');
  } catch {
    // No existing file; that's fine.
  }

  const electronCmd = process.execPath;

  const block = [
    '',
    '# --- BEGIN pdf-filler MCP (managed by PDF Filler app) ---',
    '[mcp_servers.pdf-filler]',
    'type = "stdio"',
    `command = "${electronCmd.replace(/\\/g, '\\\\')}"`,
    `args = ["${serverJs.replace(/\\/g, '\\\\')}"]`,
    'env = { ELECTRON_RUN_AS_NODE = "1" }',
    '# --- END pdf-filler MCP ---',
    ''
  ].join('\n');

  // Idempotent: if block already present, do nothing
  if (existing.includes('[mcp_servers.pdf-filler]')) {
    // Ensure preferred_auth_method is set to chatgpt for consistent UX
    if (!/\bpreferred_auth_method\s*=\s*"chatgpt"/.test(existing)) {
      const appended = `${existing.trimEnd()}\npreferred_auth_method = "chatgpt"\n`;
      await fs.writeFile(configPath, appended, 'utf8');
    }
    return;
  }

  let content = existing ? `${existing.trimEnd()}\n${block}` : block.trimStart();
  if (!/\bpreferred_auth_method\s*=\s*"chatgpt"/.test(content)) {
    content = `${content}\npreferred_auth_method = "chatgpt"\n`;
  }
  await fs.writeFile(configPath, content, 'utf8');
}

export default { ensureCodexConfig };
