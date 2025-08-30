const { spawn } = require('child_process');

// Simulate what GeminiCLIService does
const isElectronAsNode = true;
const geminiPath = '/Users/silverbook/Sites/gemini-pdf-filler/gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js';
const args = ['-m', 'gemini-2.5-flash', '-p', 'test'];

let nodeExec, nodeArgs;

if (isElectronAsNode) {
  console.log('Using Electron as Node');
  nodeExec = process.execPath;
  nodeArgs = [geminiPath, ...args];
} else {
  nodeExec = '/usr/local/bin/node';
  nodeArgs = [geminiPath, ...args];
}

console.log('Executing:', nodeExec);
console.log('With args:', nodeArgs);

const env = {
  ...process.env,
  HOME: './gemini-cli-local',
  ELECTRON_RUN_AS_NODE: isElectronAsNode ? '1' : undefined
};

const child = spawn(nodeExec, nodeArgs, { env });

child.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

child.stderr.on('data', (data) => {
  console.log('STDERR:', data.toString());
});

child.on('close', (code) => {
  console.log('Exit code:', code);
});
