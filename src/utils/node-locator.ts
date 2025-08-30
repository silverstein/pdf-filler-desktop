import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as fsc from 'fs';
import path from 'path';
import os from 'os';

type Env = NodeJS.ProcessEnv;

const X_OK = fsc.constants ? fsc.constants.X_OK : 1;

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, X_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function parseSemver(v: string): [number, number, number] {
  const cleaned = v.replace(/^v/, '').trim();
  const parts = cleaned.split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  return [major, minor, patch];
}

function compareSemverDesc(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

async function trySpawnOnce(cmd: string, args: string[], opts: { env?: Env; timeoutMs?: number } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;

    const onDone = (code: number | null) => {
      if (done) return;
      done = true;
      resolve({ code, stdout: out, stderr: err });
    };

    let timer: NodeJS.Timeout | null = null;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        try { child.kill(); } catch {}
        onDone(null);
      }, opts.timeoutMs);
    }

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', () => onDone(null));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      onDone(code);
    });
  });
}

async function whichNodeViaShell(shellPath: string, timeoutMs = 4000): Promise<string | null> {
  // Use login+interactive so that user PATH customizations (nvm in ~/.zshrc) are loaded.
  // Works without a TTY; we just execute and capture output.
  const args = ['-lic', 'command -v node || which node'];
  const res = await trySpawnOnce(shellPath, args, { timeoutMs });
  const candidate = res.stdout.trim().split('\n').pop() || '';
  if (candidate && await isExecutable(candidate)) {
    return candidate;
  }
  return null;
}

async function hasFileGlobal(nodeBin: string, timeoutMs = 2000): Promise<boolean> {
  const res = await trySpawnOnce(nodeBin, ['-e', 'console.log(typeof File !== "undefined")'], { timeoutMs });
  return res.stdout.toString().trim() === 'true';
}

async function scanNvm(home: string): Promise<string[]> {
  const base = path.join(home, '.nvm', 'versions', 'node');
  if (!(await fileExists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const vers = entries.filter(e => e.isDirectory()).map(e => e.name).sort(compareSemverDesc);
  const out: string[] = [];
  for (const v of vers) {
    const p = path.join(base, v, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
    out.push(p);
  }
  return out;
}

async function scanAsdfInstalls(home: string): Promise<string[]> {
  const base = path.join(home, '.asdf', 'installs', 'nodejs');
  if (!(await fileExists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const vers = entries.filter(e => e.isDirectory()).map(e => e.name).sort(compareSemverDesc);
  return vers.map(v => path.join(base, v, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'));
}

async function scanFnm(home: string): Promise<string[]> {
  const base = path.join(home, '.fnm', 'node-versions');
  if (!(await fileExists(base))) return [];
  const dirs = await fs.readdir(base, { withFileTypes: true });
  const out: string[] = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    // Typical: ~/.fnm/node-versions/v20.11.0/installation/bin/node
    const p = path.join(base, d.name, 'installation', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
    out.push(p);
  }
  return out;
}

async function scanNodenv(home: string): Promise<string[]> {
  const base = path.join(home, '.nodenv', 'versions');
  if (!(await fileExists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const vers = entries.filter(e => e.isDirectory()).map(e => e.name).sort(compareSemverDesc);
  return vers.map(v => path.join(base, v, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'));
}

function defaultShell(): string {
  const s = process.env.SHELL;
  if (s && s.length > 0) return s;
  // Reasonable macOS default
  return '/bin/zsh';
}

export interface FindNodeOptions {
  timeoutMs?: number;
  shellInteractive?: boolean;
  extraCandidates?: string[]; // e.g., a bundled Node in app.asar.unpacked
}

export async function findSystemNodeBinary(options: FindNodeOptions = {}): Promise<string | null> {
  const home = os.homedir();
  const timeoutMs = options.timeoutMs ?? 5000;

  // 0) Try Electron's built-in Node first (if we're in Electron)
  // This works with Electron 37+ which has Node 22+ with the File global
  // We use a shim to normalize argv for Gemini CLI's yargs parser
  if (process.versions && process.versions.electron) {
    try {
      // Test if Electron's Node has the File global when run as Node
      const electronAsNode = process.execPath;
      const testEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
      const res = await trySpawnOnce(
        electronAsNode, 
        ['-e', 'console.log(typeof File !== "undefined")'],
        { env: testEnv, timeoutMs: 1500 }
      );
      
      if (res.stdout.trim() === 'true') {
        console.log('Electron\'s built-in Node has File global - using ELECTRON_AS_NODE');
        // Return a special marker that the caller will recognize
        return 'ELECTRON_AS_NODE';
      }
    } catch (e) {
      console.log('Electron\'s built-in Node doesn\'t have File global, searching for system Node...');
    }
  }

  // 1) Explicit overrides
  const envCandidates = uniq([
    process.env.PDF_FILLER_NODE_PATH || '',
    process.env.NODE_BINARY || '',
    process.env.NVM_BIN ? path.join(process.env.NVM_BIN, process.platform === 'win32' ? 'node.exe' : 'node') : ''
  ]).filter(Boolean);

  // 2) Well-known locations on macOS & general UNIX
  const staticCandidates = uniq([
    path.join(home, '.volta', 'bin', process.platform === 'win32' ? 'node.exe' : 'node'),
    path.join(home, '.asdf', 'shims', process.platform === 'win32' ? 'node.exe' : 'node'),
    path.join(home, '.nodenv', 'shims', process.platform === 'win32' ? 'node.exe' : 'node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    '/opt/local/bin/node'
  ]);

  // 3) Version managers that keep multiple versions
  const dynamicCandidates = uniq([
    ...(await scanNvm(home)),
    ...(await scanAsdfInstalls(home)),
    ...(await scanFnm(home)),
    ...(await scanNodenv(home))
  ]);

  // 4) Optional extra candidates (e.g., a bundled Node path)
  const extra = options.extraCandidates ?? [];

  // Try in order:
  const ordered = uniq([
    ...envCandidates,
    ...extra,
    ...dynamicCandidates,
    ...staticCandidates
  ]);

  for (const p of ordered) {
    if (await isExecutable(p)) {
      try {
        if (await hasFileGlobal(p, 1500)) {
          return p;
        }
      } catch {
        // Ignore & continue
      }
    }
  }

  // 5) As a last resort, ask the user's shell (interactive login) to resolve node
  if (options.shellInteractive !== false) {
    try {
      const shell = defaultShell();
      const found = await whichNodeViaShell(shell, timeoutMs);
      if (found && await isExecutable(found)) {
        try {
          if (await hasFileGlobal(found, 1500)) {
            return found;
          }
        } catch {
          // fallthrough
        }
      }
    } catch {
      // fallthrough
    }
  }

  return null;
}