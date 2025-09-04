import { shell } from 'electron';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export interface CodexInstallStatus {
  installed: boolean;
  path?: string;
}

export function getCodexReleasesURL(): string {
  return 'https://github.com/openai/codex/releases/latest';
}

export async function checkCodexInstalled(): Promise<CodexInstallStatus> {
  const which = await new Promise<string | null>((resolve) => {
    const { spawn } = require('child_process');
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const p = spawn(cmd, ['codex']);
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('close', () => {
      const line = out.split('\n').map((s) => s.trim()).find((l) => !!l);
      resolve(line || null);
    });
    p.on('error', () => resolve(null));
  });
  if (which) return { installed: true, path: which };
  return { installed: false };
}

export async function promptInstallCodex(): Promise<void> {
  // For v1: open releases page for user to install the binary.
  await shell.openExternal(getCodexReleasesURL());
}

export default { checkCodexInstalled, promptInstallCodex, getCodexReleasesURL };

