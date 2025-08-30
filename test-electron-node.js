// Test if Electron's built-in Node has the File global
const { spawn } = require('child_process');
const { app } = require('electron');

// Wait for app to be ready
app.whenReady().then(() => {
  console.log('Testing Electron as Node...');
  console.log('Electron version:', process.versions.electron);
  console.log('Node version:', process.versions.node);
  console.log('process.execPath:', process.execPath);
  
  // Test if Electron's Node has File global
  const child = spawn(process.execPath, ['-e', 'console.log(typeof File !== "undefined")'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  
  child.stdout.on('data', (data) => {
    const hasFile = data.toString().trim() === 'true';
    console.log('Electron\'s Node has File global?', hasFile);
    if (hasFile) {
      console.log('✅ Good news! Your Electron can be used as Node for Gemini CLI');
    } else {
      console.log('❌ Electron\'s Node lacks File global - need system Node');
    }
  });
  
  child.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
  });
  
  child.on('close', (code) => {
    console.log('Test complete, exit code:', code);
    app.quit();
  });
});