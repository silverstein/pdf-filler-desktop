const { app, BrowserWindow, Tray, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn, fork } = require('child_process');
const fs = require('fs').promises;
// Use simple auth handler for now (node-pty has build issues)
const SimpleAuthHandler = require('./simple-auth-handler');
const FirstRunSetup = require('./first-run-setup');
const MCPManager = require('./mcp-manager');
const { ensureMCPConfig } = require('./mcp-config-generator');

// Add comprehensive logging
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  // Also write to a log file in production
  if (app.isPackaged) {
    const logPath = path.join(app.getPath('userData'), 'app.log');
    fs.appendFile(logPath, `[${timestamp}] ${message}\n`).catch(() => {});
  }
};

log('Electron app starting...');
log(`App packaged: ${app.isPackaged}`);
log(`__dirname: ${__dirname}`);
log(`process.resourcesPath: ${process.resourcesPath || 'not set'}`);

let mainWindow = null;
let tray = null;
let serverProcess = null;
let mcpManager = null;

const SERVER_PORT = 3456;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Set the app name for macOS menu bar
app.setName('PDF Filler');

// Start the Express server
function startServer() {
  log('Starting Express server...');
  return new Promise((resolve, reject) => {
    // In production, server.js is in the asar archive which node can't execute directly
    // We need to use electron's fork or extract it
    const serverPath = path.join(__dirname, 'server.js');
    log(`Server path: ${serverPath}`);
    
    // Use electron's fork for ASAR compatibility
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: SERVER_PORT },
      silent: true // Capture stdout/stderr
    });

    serverProcess.stdout.on('data', (data) => {
      log(`Server: ${data}`);
      if (data.toString().includes('running on')) {
        log('Server started successfully');
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      log(`Server Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      log(`Failed to start server: ${error}`);
      reject(error);
    });

    // Give server time to start
    setTimeout(resolve, 2000);
  });
}

// Create the main window
function createWindow() {
  log('Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // icon: path.join(__dirname, '../assets/icon.png'), // Optional icon
    title: 'PDF Filler'
  });

  log(`Loading URL: ${SERVER_URL}`);
  mainWindow.loadURL(SERVER_URL);
  
  // Open DevTools only when DEBUG env var is set
  if (process.env.DEBUG === '1') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent window from closing, minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create system tray
function createTray() {
  log('Creating system tray...');
  // Use a simple unicode character as tray icon if image doesn't exist
  const trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
  
  // Always create tray with text on macOS since we don't have an icon
  const { nativeImage } = require('electron');
  
  if (process.platform === 'darwin') {
    // Create an empty image and use text instead
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('📄 PDF'); // Show PDF emoji and text in menu bar
  } else {
    // For other platforms, try to create with empty image
    try {
      tray = new Tray(nativeImage.createEmpty());
      tray.setTitle('PDF Filler');
    } catch (error) {
      console.error('Could not create tray icon:', error);
      return;
    }
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open PDF Filler',
      click: () => {
        if (mainWindow === null) {
          createWindow();
        } else {
          mainWindow.show();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Check Gemini CLI',
      click: async () => {
        const { exec } = require('child_process');
        exec('which gemini', (error, stdout) => {
          if (error) {
            dialog.showMessageBox({
              type: 'warning',
              title: 'Gemini CLI Not Found',
              message: 'Gemini CLI is not installed.',
              detail: 'Please install Gemini CLI to use this application.\n\nVisit: https://github.com/google/generative-ai-docs',
              buttons: ['OK', 'Open Installation Guide']
            }).then((result) => {
              if (result.response === 1) {
                shell.openExternal('https://github.com/google/generative-ai-docs');
              }
            });
          } else {
            dialog.showMessageBox({
              type: 'info',
              title: 'Gemini CLI Found',
              message: 'Gemini CLI is installed and ready!',
              detail: `Location: ${stdout.trim()}`
            });
          }
        });
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow === null) {
          createWindow();
        }
        mainWindow.show();
        mainWindow.webContents.send('open-settings');
      }
    },
    {
      label: 'About',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'About PDF Filler',
          message: 'PDF Filler',
          detail: 'Free PDF processing powered by Google Gemini AI\n\nVersion: 1.0.0\nAuthor: Mat Silverstein\nWebsite: x1wealth.com\n\nUsing Google\'s generous free tier:\n• 60 requests per minute\n• 1,000 requests per day\n• 1M token context window'
        });
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('PDF Filler - Free AI-powered PDF processing');
  tray.setContextMenu(contextMenu);

  // Click on tray icon shows window
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// App event handlers
app.whenReady().then(async () => {
  log('App ready event fired');
  try {
    // Generate MCP config with correct paths for this system
    await ensureMCPConfig();
    log('MCP config ensured');
    
    // Check if local Gemini CLI is installed
    const isProduction = __dirname.includes('app.asar');
    log(`Production mode: ${isProduction}`);
    
    let localGeminiPath;
    if (isProduction) {
      // In production, gemini-cli-local is at the app.asar.unpacked root
      const resourcesPath = path.join(__dirname, '../../');
      localGeminiPath = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local/node_modules/.bin/gemini');
    } else {
      // In development, it's relative to src
      localGeminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
    }
    log(`Checking for Gemini CLI at: ${localGeminiPath}`);
    
    try {
      await fs.access(localGeminiPath);
      log('Local Gemini CLI found');
    } catch (error) {
      log(`Gemini CLI not found: ${error.message}`);
      if (isProduction) {
        // In production, Gemini should be bundled - if not found, it's a build issue
        dialog.showErrorBox('Missing Component', 
          'Gemini CLI was not properly bundled with the app. Please reinstall the application.');
      } else {
        // In development, try to install
        log('Installing local Gemini CLI for development...');
        const setup = new FirstRunSetup();
        await setup.installLocalGemini();
      }
    }
    
    // Start the server
    log('Starting server...');
    await startServer();
    log('Server started');
    
    // MCP servers are now configured in gemini-cli-local/.gemini/mcp_servers.json
    // So Gemini CLI will start them automatically when needed
    log('MCP servers configured for Gemini CLI');
    
    // Create tray icon
    createTray();
    log('Tray created');
    
    // Create main window
    createWindow();
    log('Window created');
    
    // Handle file drops from Finder (macOS)
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      if (filePath.endsWith('.pdf')) {
        if (mainWindow === null) {
          createWindow();
        }
        mainWindow.show();
        mainWindow.webContents.send('process-pdf', filePath);
      }
    });
  } catch (error) {
    log(`Failed to start application: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
    dialog.showErrorBox('Startup Error', `Failed to start the application: ${error.message}\n\nPlease check the logs at: ${app.getPath('userData')}/app.log`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep app running in tray when window is closed
  if (process.platform !== 'darwin') {
    // Don't quit on macOS
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Clean up server process
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Initialize auth handler
const authHandler = new SimpleAuthHandler();

// IPC handlers for renderer communication
ipcMain.handle('check-auth-status', async () => {
  return await authHandler.checkAuthStatus();
});

ipcMain.handle('start-google-auth', async () => {
  try {
    await authHandler.startAuth(mainWindow);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-auth', async () => {
  await authHandler.clearAuth();
  return { success: true };
});

ipcMain.handle('get-rate-limits', async () => {
  // This would connect to the server to get current rate limit status
  try {
    const response = await fetch(`${SERVER_URL}/api/health`);
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message };
  }
});

// Native file selection dialog
ipcMain.handle('select-pdf', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    // Add to recent files
    await addToRecentFiles(filePath);
    return { success: true, filePath };
  }
  return { success: false, canceled: true };
});

// Save dialog for filled PDFs
ipcMain.handle('save-pdf', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'filled-form.pdf',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });
  
  if (!result.canceled) {
    return { success: true, filePath: result.filePath };
  }
  return { success: false, canceled: true };
});

// Recent files management
const RECENT_FILES_PATH = path.join(app.getPath('userData'), 'recent-files.json');
const MAX_RECENT_FILES = 10;

async function loadRecentFiles() {
  try {
    const data = await fs.readFile(RECENT_FILES_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveRecentFiles(files) {
  await fs.writeFile(RECENT_FILES_PATH, JSON.stringify(files, null, 2));
}

async function addToRecentFiles(filePath) {
  let recentFiles = await loadRecentFiles();
  
  // Remove if already exists (to move to top)
  recentFiles = recentFiles.filter(f => f.path !== filePath);
  
  // Add to beginning
  recentFiles.unshift({
    path: filePath,
    name: path.basename(filePath),
    lastUsed: new Date().toISOString()
  });
  
  // Keep only MAX_RECENT_FILES
  recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
  
  await saveRecentFiles(recentFiles);
  
  // Send update to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recent-files-updated', recentFiles);
  }
}

ipcMain.handle('get-recent-files', async () => {
  return await loadRecentFiles();
});

ipcMain.handle('clear-recent-files', async () => {
  await saveRecentFiles([]);
  return { success: true };
});

ipcMain.handle('remove-recent-file', async (event, filePath) => {
  let recentFiles = await loadRecentFiles();
  recentFiles = recentFiles.filter(f => f.path !== filePath);
  await saveRecentFiles(recentFiles);
  return { success: true, files: recentFiles };
});