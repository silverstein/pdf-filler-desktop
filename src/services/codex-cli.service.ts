import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export class CodexCLIService {
  private codexPath: string | null = null;
  private codexHomePath: string | null = null;
  private projectRoot: string | null = null;

  private getProjectRoot(): string {
    if (this.projectRoot) return this.projectRoot;
    
    // In packaged app, go up from app.asar
    if (__dirname.includes('app.asar')) {
      this.projectRoot = path.join(__dirname, '..', '..', '..');
    } else {
      // In development, project root is two levels up from src/services
      this.projectRoot = path.join(__dirname, '..', '..');
    }
    
    return this.projectRoot;
  }

  private async resolveCodexPath(): Promise<string | null> {
    if (this.codexPath) return this.codexPath;

    // Prefer bundled binary inside the app (asar-unpacked)
    const isPackaged = __dirname.includes('app.asar');
    const candidates: string[] = [];
    if (isPackaged) {
      const base = path.join(__dirname, '..', '..', '..');
      const root = path.join(base, 'codex-cli-local');
      // Prefer npm-installed shim in node_modules/.bin
      candidates.push(path.join(root, 'node_modules', '.bin', 'codex'));
      candidates.push(path.join(root, 'node_modules', '.bin', 'codex.cmd'));
      // Fallback to package bin
      candidates.push(path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex'));
      candidates.push(path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.cmd'));
      // Last resort: any local bin dropped in prepare-codex
      candidates.push(path.join(root, 'bin', 'codex'));
      candidates.push(path.join(root, 'bin', 'codex.exe'));
    } else {
      const root = path.join(__dirname, '../../codex-cli-local');
      candidates.push(path.join(root, 'node_modules', '.bin', 'codex'));
      candidates.push(path.join(root, 'node_modules', '.bin', 'codex.cmd'));
      candidates.push(path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex'));
      candidates.push(path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.cmd'));
      candidates.push(path.join(root, 'bin', 'codex'));
      candidates.push(path.join(root, 'bin', 'codex.exe'));
    }

    for (const p of candidates) {
      try { await fs.access(p); this.codexPath = p; return p; } catch {}
    }

    // Fallback to PATH
    const which = await new Promise<string | null>((resolve) => {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const proc = spawn(cmd, ['codex']);
      let out = '';
      proc.stdout.on('data', (d) => out += d.toString());
      proc.on('close', () => resolve(out.split(/\r?\n/)[0]?.trim() || null));
      proc.on('error', () => resolve(null));
    });
    if (which) { this.codexPath = which; return which; }
    return null;
  }

  private async resolveCodexHome(): Promise<string | null> {
    if (this.codexHomePath !== null) return this.codexHomePath;

    const projectRoot = this.getProjectRoot();
    const candidates: string[] = [];

    // Development build keeps a bundled CODEX_HOME inside the workspace
    candidates.push(path.join(projectRoot, 'codex-cli-local', 'app-home'));

    // Packaged builds unpack assets under app.asar.unpacked
    if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'codex-cli-local', 'app-home'));
      candidates.push(path.join(process.resourcesPath, 'codex-cli-local', 'app-home'));
    }

    const seen = new Set<string>();
    for (const candidate of candidates) {
      const normalized = path.normalize(candidate);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      try {
        await fs.access(path.join(normalized, 'config.toml'));
        this.codexHomePath = normalized;
        return normalized;
      } catch {}
    }

    this.codexHomePath = null;
    return null;
  }

  async checkAuthStatus(): Promise<boolean> {
    // Auth recorded in ~/.codex/auth.json
    try {
      const authPath = path.join(os.homedir(), '.codex', 'auth.json');
      const raw = await fs.readFile(authPath, 'utf8');
      const parsed = JSON.parse(raw);
      return !!parsed;
    } catch {
      return false;
    }
  }

  async callCodex(prompt: string, opts?: { cwd?: string, timeoutMs?: number }): Promise<string> {
    const bin = await this.resolveCodexPath();
    if (!bin) throw new Error('Codex CLI not found');

    const codexHome = await this.resolveCodexHome();
    return new Promise((resolve, reject) => {
      const args: string[] = [];
      if (!codexHome) {
        // Fall back to inline override to preserve ChatGPT auth flow
        args.push('--config', 'preferred_auth_method="chatgpt"');
      }
      // Order matters: top-level config overrides, then subcommand exec with its flags
      args.push('exec', '--skip-git-repo-check', prompt);
      const workingDir = opts?.cwd || this.getProjectRoot();
      const envVars = { ...process.env };
      if (codexHome) {
        envVars.CODEX_HOME = codexHome;
      }
      
      if (process.env.DEBUG_CODEX === '1') {
        console.log('[CodexCLI] bin:', bin);
        console.log('[CodexCLI] codexHome:', codexHome || 'using user home');
        console.log('[CodexCLI] args:', JSON.stringify(args));
        console.log('[CodexCLI] cwd:', workingDir);
      }
      const proc = spawn(bin, args, {
        cwd: workingDir,
        env: envVars
      });
      let out = '';
      let err = '';
      const t = setTimeout(() => { try { proc.kill(); } catch{}; reject(new Error('Codex timeout')); }, opts?.timeoutMs || 180000);
      proc.stdout.on('data', (d) => {
        const s = d.toString();
        out += s;
        if (process.env.DEBUG_CODEX === '1' && out.length < 8000) {
          console.log('[CodexCLI] stdout chunk:', s.slice(0, 200));
        }
      });
      proc.stderr.on('data', (d) => {
        const s = d.toString();
        err += s;
        if (process.env.DEBUG_CODEX === '1') console.warn('[CodexCLI] stderr:', s.trim());
      });
      proc.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(out.trim()); else reject(new Error(err || 'Codex failed')); });
      proc.on('error', (e) => { clearTimeout(t); reject(e); });
    });
  }

  // Clear authentication (logout)
  async clearAuth(): Promise<void> {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const targets = [
      path.join(codexHome, 'auth.json'),
      path.join(codexHome, 'session.json'),
      path.join(codexHome, 'session.lock')
    ];

    const failures: string[] = [];

    for (const target of targets) {
      try {
        await fs.unlink(target);
        if (process.env.DEBUG_CODEX === '1') {
          console.log(`[CodexCLI] Removed ${target}`);
        }
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          continue;
        }
        failures.push(`${path.basename(target)}: ${error?.message || error}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Unable to clear Codex auth: ${failures.join('; ')}`);
    }
  }
}

export default CodexCLIService;
