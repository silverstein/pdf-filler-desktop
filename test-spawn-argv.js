const { spawn } = require('child_process');
const { app } = require('electron');

app.whenReady().then(() => {
  const checkArgv = `
    console.log('Child process.argv:', JSON.stringify(process.argv));
  `;
  
  const child = spawn(process.execPath, [
    '-e', checkArgv
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  child.stdout.on('data', d => console.log(d.toString()));
  child.on('close', () => {
    // Now test with a script file
    const child2 = spawn(process.execPath, [
      'check-argv.js', '-m', 'test'
    ], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    
    child2.stdout.on('data', d => console.log('With script:', d.toString()));
    child2.on('close', () => app.quit());
  });
});
