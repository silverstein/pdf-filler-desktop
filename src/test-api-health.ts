import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

function waitForServerOutput(child: ReturnType<typeof spawn>, keyword: string, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for server to start')), timeoutMs);
    const onData = (data: Buffer) => {
      const text = data.toString();
      if (text.includes(keyword)) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        resolve(true);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (d) => {
      const text = d.toString();
      // Detect sandboxed environments where binding to a port is not permitted
      if (
        text.includes('operation not permitted') ||
        text.includes('listen EACCES') ||
        text.includes('listen EPERM') ||
        text.includes('EADDRINUSE') ||
        text.includes('address already in use')
      ) {
        console.warn('Skipping API test: sandbox blocked listening on a port.');
        clearTimeout(timer);
        try { child.kill('SIGTERM'); } catch {}
        resolve(false);
        return;
      }
      process.stderr.write(d);
    });
  });
}

async function httpGetJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(JSON.parse(body));
        } catch (e: any) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function main() {
  // Start the API with ts-node so we don't require a prior build
  const tsNodeRegister = require.resolve('ts-node/register');
  const serverTs = path.join(process.cwd(), 'src', 'server.ts');
  const child = spawn(process.execPath, ['-r', tsNodeRegister, serverTs], {
    env: { ...process.env, PORT: '3456' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const ready = await waitForServerOutput(child, 'running on');
  if (!ready) {
    console.log('API health test skipped.');
    return;
  }
  try {
    const health = await httpGetJson<any>('http://localhost:3456/api/health');
    assert.strictEqual(health.status, 'ok');
    assert.ok(typeof health.geminiCLI === 'string');
    console.log('API health test passed:', health);
  } finally {
    try { child.kill('SIGTERM'); } catch {}
  }
}

main().catch((err) => {
  console.error('API health test failed:', err);
  process.exit(1);
});
