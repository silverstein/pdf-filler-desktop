const { app } = require('electron');

app.whenReady().then(() => {
  console.log('process.argv:', process.argv);
  console.log('process.execPath:', process.execPath);
  console.log('process.argv0:', process.argv0);
  app.quit();
});
