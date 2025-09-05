import { exec, spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import TerminalWindow from './terminal-window';
import { app } from 'electron';

interface CodexAuthStatus {
  installed: boolean;
  authenticated: boolean;
  detail?: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Minimal handler for Codex CLI auth ("Sign in with ChatGPT").
 * - Detects Codex CLI binary
 * - Launches system Terminal to run `codex auth login`
 * - Polls for status for up to 5 minutes
 *
 * Notes:
 * - We do not bundle Codex; this relies on the user installing Codex CLI.
 * - We write MCP config separately via ensureCodexConfig().
 */
export class CodexAuthHandler {
  private cachedCodexPath: string | null = null;

  async findCodexBinary(): Promise<string | null> {
    if (this.cachedCodexPath) return this.cachedCodexPath;

    // Allow explicit override
    if (process.env.CODEX_CLI_PATH) {
      try {
        await fs.access(process.env.CODEX_CLI_PATH);
        this.cachedCodexPath = process.env.CODEX_CLI_PATH;
        return this.cachedCodexPath;
      } catch {}
    }

    const platform = process.platform;

    // 1) Prefer bundled Codex CLI within the app (mirrors gemini-cli-local)
    try {
      const base = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'codex-cli-local')
        : path.join(__dirname, '..', 'codex-cli-local');

      const candidatesLocal: string[] = [];
      if (platform === 'win32') {
        candidatesLocal.push(
          path.join(base, 'node_modules', '@openai', 'codex', 'codex.exe'),
          path.join(base, 'node_modules', '.bin', 'codex.exe'),
          path.join(base, 'bin', 'codex.exe')
        );
      } else {
        candidatesLocal.push(
          path.join(base, 'node_modules', '@openai', 'codex', 'codex'),
          path.join(base, 'node_modules', '@openai', 'codex', 'bin', 'codex'),
          path.join(base, 'node_modules', '.bin', 'codex'),
          path.join(base, 'bin', 'codex')
        );
      }

      for (const p of candidatesLocal) {
        try {
          await fs.access(p);
          this.cachedCodexPath = p;
          return p;
        } catch {}
      }
    } catch {}

    const tryAccess = async (p: string): Promise<string | null> => {
      try {
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    };

    // Common locations
    const candidates: string[] = [];
    if (platform === 'darwin' || platform === 'linux') {
      candidates.push('/usr/local/bin/codex', '/opt/homebrew/bin/codex', '/usr/bin/codex', '/bin/codex');
    } else if (platform === 'win32') {
      candidates.push('C:/Program Files/Codex/codex.exe', 'C:/Program Files (x86)/Codex/codex.exe');
    }

    // 2) PATH lookup using shell
    const pathLookup = await new Promise<string | null>((resolve) => {
      const cmd = platform === 'win32' ? 'where' : 'which';
      const proc = spawn(cmd, ['codex']);
      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        const line = out.split('\n').map((s) => s.trim()).find((l) => !!l);
        resolve(line || null);
      });
      proc.on('error', () => resolve(null));
    });
    if (pathLookup) {
      const resolved = await tryAccess(pathLookup);
      if (resolved) {
        this.cachedCodexPath = resolved;
        return resolved;
      }
    }

    for (const cand of candidates) {
      const resolved = await tryAccess(cand);
      if (resolved) {
        this.cachedCodexPath = resolved;
        return resolved;
      }
    }

    return null;
  }

  async checkAuthStatus(): Promise<CodexAuthStatus> {
    const codex = await this.findCodexBinary();
    if (!codex) {
      return { installed: false, authenticated: false, detail: 'Codex CLI not found in PATH' };
    }

    // Per docs, login creates $CODEX_HOME/auth.json (defaults to ~/.codex/auth.json)
    const home = os.homedir();
    const authPath = path.join(home, '.codex', 'auth.json');
    try {
      const raw = await fs.readFile(authPath, 'utf8');
      // light validation that it is JSON and not empty
      const parsed = JSON.parse(raw);
      const ok = parsed && typeof parsed === 'object';
      return { installed: true, authenticated: !!ok, detail: ok ? 'auth.json present' : 'auth.json unreadable' };
    } catch {
      return { installed: true, authenticated: false, detail: 'auth.json not found' };
    }
  }

  async clearAuth(): Promise<void> {
    // Clear Codex authentication by removing auth.json
    const home = os.homedir();
    const authPath = path.join(home, '.codex', 'auth.json');
    try {
      await fs.unlink(authPath);
      console.log('Codex authentication cleared successfully');
    } catch (error) {
      // File might not exist, which is fine
      console.log('Codex auth file not found or already cleared');
    }
  }

  async startAuth(): Promise<AuthResult> {
    const codex = await this.findCodexBinary();
    if (!codex) {
      return { success: false, error: 'Codex CLI not found. Please install Codex CLI first.' };
    }

    const platform = process.platform;
    const tmp = os.tmpdir();
    const scriptPath = path.join(tmp, `codex-auth-${Date.now()}.${platform === 'win32' ? 'cmd' : 'sh'}`);

    try {
      if (platform === 'win32') {
        const content = `@echo off\n"${codex}" login\n`;
        await fs.writeFile(scriptPath, content, 'utf8');
      } else {
        const content = `#!/bin/bash\n"${codex}" login\n`;
        await fs.writeFile(scriptPath, content, { encoding: 'utf8' });
        await fs.chmod(scriptPath, 0o755);
      }
    } catch (e: any) {
      return { success: false, error: `Failed to prepare auth script: ${e.message}` };
    }

    if (platform === 'darwin' || platform === 'linux') {
      // Use custom terminal window for consistent UX
      const terminalWindow = new TerminalWindow();
      await terminalWindow.create();
      const success = await terminalWindow.runScript(`#!/bin/bash\n"${codex}" login\n`, {
        title: 'ChatGPT Authentication',
      });
      return success ? { success: true } : { success: false, error: 'Authentication failed or timed out' };
    } else {
      // Open system terminal on Windows
      await new Promise<void>((resolve) => {
        exec(`start cmd /k "${scriptPath}"`, () => resolve());
      });
    }

    // Poll for up to 5 minutes (auth.json presence)
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      const status = await this.checkAuthStatus();
      if (status.installed && status.authenticated) {
        return { success: true };
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    return { success: false, error: 'Codex authentication timeout' };
  }
}

export default CodexAuthHandler;
