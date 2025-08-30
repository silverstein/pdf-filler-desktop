const { spawn } = require('child_process');
const { app } = require('electron');

app.whenReady().then(() => {
  const geminiPath = '/Users/silverbook/Sites/gemini-pdf-filler/gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js';
  
  const child = spawn(process.execPath, [
    geminiPath, 
    '-m', 'gemini-2.5-flash',
    '-p', 'Say "hello" and nothing else'
  ], {
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1',
      HOME: './gemini-cli-local',
      GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop',
      GOOGLE_GENAI_USE_GCA: 'true'
    }
  });

  let output = '';
  child.stdout.on('data', d => output += d.toString());
  child.stderr.on('data', d => console.error('Error:', d.toString()));
  child.on('close', code => {
    console.log('Output:', output);
    console.log('Exit code:', code);
    app.quit();
  });
  
  setTimeout(() => {
    child.kill();
    app.quit();
  }, 5000);
});
