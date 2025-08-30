// Test if the issue still exists without the shim
const { spawn } = require('child_process');
const { app } = require('electron');

app.whenReady().then(() => {
  const geminiPath = '/Users/silverbook/Sites/gemini-pdf-filler/gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js';
  
  console.log('Testing direct invocation from Electron app context:');
  
  const child = spawn(process.execPath, [
    geminiPath,
    '-m', 'gemini-2.5-flash',
    '-p', 'Say hello and nothing else'
  ], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      GEMINI_CLI_NO_RELAUNCH: '1',
      HOME: './gemini-cli-local',
      GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop',
      GOOGLE_GENAI_USE_GCA: 'true'
    }
  });
  
  let output = '';
  child.stdout.on('data', d => output += d.toString());
  child.stderr.on('data', d => console.error('Error:', d.toString()));
  child.on('close', code => {
    console.log('Output:', output.substring(0, 200));
    console.log('Exit code:', code);
    app.quit();
  });
  
  setTimeout(() => {
    child.kill();
    app.quit();
  }, 5000);
});
