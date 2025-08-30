const { spawn } = require('child_process');

// Test direct invocation with ELECTRON_RUN_AS_NODE
const geminiPath = '/Users/silverbook/Sites/gemini-pdf-filler/gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js';

const child = spawn(process.execPath, [geminiPath, '--version'], {
  env: { 
    ...process.env, 
    ELECTRON_RUN_AS_NODE: '1',
    HOME: './gemini-cli-local'
  }
});

child.stdout.on('data', d => console.log('Output:', d.toString()));
child.stderr.on('data', d => console.log('Error:', d.toString()));
child.on('close', code => console.log('Exit code:', code));
