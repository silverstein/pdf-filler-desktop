const { spawn } = require('child_process');
const { app } = require('electron');

app.whenReady().then(() => {
  console.log('Main process argv:', process.argv);
  
  const child = spawn(process.execPath, [
    '-e', 'console.log("Child argv:", process.argv)'
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  child.stdout.on('data', d => console.log(d.toString()));
  child.on('close', () => app.quit());
});
