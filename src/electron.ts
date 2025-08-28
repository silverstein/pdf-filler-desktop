import { 
  app, 
  BrowserWindow, 
  Tray, 
  Menu, 
  shell, 
  dialog, 
  ipcMain,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions 
} from 'electron';
import path from 'path';
import { spawn, fork, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
// Use terminal auth handler (gemini CLI requires interactive Terminal)
import TerminalAuthHandler from './terminal-auth-handler';
import FirstRunSetup from './first-run-setup';
import MCPManager from './mcp-manager';
import { ensureMCPConfig } from './mcp-config-generator';

// Type definitions
interface ServerStatus {
  online: boolean;
  url: string;
  error?: string;
}

interface AuthCheckResult {
  authenticated: boolean;
  email?: string;
  error?: string;
}

// Add comprehensive logging
const log = (message: string): void => {
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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let mcpManager: any | null = null;

const SERVER_PORT = 3456;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Set the app name for macOS menu bar
app.setName('PDF Filler');

// Start the Express server
function startServer(): Promise<void> {
  log('Starting Express server...');
  return new Promise((resolve, reject) => {
    // In production, server.js is in the asar archive which node can't execute directly
    // We need to use electron's fork or extract it
    const serverPath = path.join(__dirname, 'server.js');
    log(`Server path: ${serverPath}`);
    
    // Use electron's fork for ASAR compatibility
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: String(SERVER_PORT) },
      silent: true // Capture stdout/stderr
    });

    serverProcess.stdout?.on('data', (data) => {
      log(`Server: ${data}`);
      if (data.toString().includes('running on')) {
        log('Server started successfully');
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
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
function createWindow(): void {
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

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Create system tray icon
function createTray(): void {
  log('Creating system tray...');
  
  // Create a dummy 1x1 transparent icon for the tray
  // On macOS, we'll set text instead
  const { nativeImage } = require('electron');
  const icon = nativeImage.createEmpty();
  
  tray = new Tray(icon);
  
  // On macOS, set a title instead of icon
  if (process.platform === 'darwin') {
    tray.setTitle('📄 PDF');
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open PDF Filler', 
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        app.quit();
      }
    }
  ] as MenuItemConstructorOptions[]);
  
  tray.setToolTip('PDF Filler - AI-powered PDF processing');
  tray.setContextMenu(contextMenu);
  
  // Double-click to open on Windows
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// Handle file selection (with both names for compatibility)
ipcMain.handle('select-file', async (event: IpcMainInvokeEvent, options: any = {}) => {
  log('File selection requested');
  
  const defaultOptions = {
    title: 'Select File',
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  };
  
  const result = await dialog.showOpenDialog(mainWindow!, {
    ...defaultOptions,
    ...options
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    log(`File selected: ${result.filePaths[0]}`);
    return { success: true, filePath: result.filePaths[0] };
  }
  
  log('File selection cancelled');
  return { success: false };
});

// Also register as select-pdf for preload compatibility
ipcMain.handle('select-pdf', async (event: IpcMainInvokeEvent) => {
  log('File selection requested');
  
  const defaultOptions = {
    title: 'Select PDF File',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile' as const]
  };
  
  const result = await dialog.showOpenDialog(
    mainWindow!,
    defaultOptions
  );
  
  if (!result.canceled && result.filePaths.length > 0) {
    log(`File selected: ${result.filePaths[0]}`);
    return result.filePaths[0];
  }
  
  return null;
});

// Handle save file dialog (with both names for compatibility)
ipcMain.handle('save-file', async (event: IpcMainInvokeEvent, options: any = {}) => {
  log('Save file dialog requested');
  
  const defaultOptions = {
    title: 'Save File',
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  };
  
  const result = await dialog.showSaveDialog(mainWindow!, {
    ...defaultOptions,
    ...options
  });
  
  if (!result.canceled && result.filePath) {
    log(`Save path selected: ${result.filePath}`);
    return { success: true, filePath: result.filePath };
  }
  
  log('Save dialog cancelled');
  return { success: false };
});

// Also register as save-pdf for preload compatibility
ipcMain.handle('save-pdf', async (event: IpcMainInvokeEvent, defaultName?: string) => {
  log('Save file dialog requested');
  
  const defaultOptions = {
    title: 'Save PDF File',
    defaultPath: defaultName || 'filled-form.pdf',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  };
  
  const result = await dialog.showSaveDialog(
    mainWindow!,
    defaultOptions
  );
  
  if (!result.canceled && result.filePath) {
    log(`Save path selected: ${result.filePath}`);
    return result.filePath;
  }
  
  return null;
});

// Handle CSV file selection
ipcMain.handle('select-csv', async (event: IpcMainInvokeEvent) => {
  log('CSV file selection requested');
  
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select CSV File',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    log(`CSV file selected: ${result.filePaths[0]}`);
    return result.filePaths[0];
  }
  
  return null;
});

// Handle directory selection
ipcMain.handle('select-directory', async (event: IpcMainInvokeEvent, options: any = {}) => {
  log('Directory selection requested');
  
  const defaultOptions = {
    title: 'Select Output Directory',
    properties: ['openDirectory', 'createDirectory']
  };
  
  const result = await dialog.showOpenDialog(
    mainWindow!,
    { ...defaultOptions, ...options }
  );
  
  if (!result.canceled && result.filePaths.length > 0) {
    log(`Directory selected: ${result.filePaths[0]}`);
    return result.filePaths[0];
  }
  
  return null;
});

// Handle auth check (with both names for compatibility)
ipcMain.handle('check-auth', async (): Promise<AuthCheckResult> => {
  try {
    log('Checking authentication status...');
    const authHandler = new TerminalAuthHandler();
    const status = await authHandler.checkAuthStatus();
    return { 
      authenticated: status.authenticated,
      email: status.email 
    };
  } catch (error: any) {
    log(`Auth check error: ${error.message}`);
    return { authenticated: false, error: error.message };
  }
});

// Also register as check-auth-status for preload compatibility
ipcMain.handle('check-auth-status', async (): Promise<AuthCheckResult> => {
  try {
    log('Checking authentication status...');
    const authHandler = new TerminalAuthHandler();
    const status = await authHandler.checkAuthStatus();
    log(`Authentication status: ${status.authenticated}, email: ${status.email}`);
    return { 
      authenticated: status.authenticated,
      email: status.email 
    };
  } catch (error: any) {
    log(`Auth check error: ${error.message}`);
    return { authenticated: false, error: error.message };
  }
});

// Handle auth flow (with both names for compatibility)
ipcMain.handle('start-auth', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    log('Starting authentication flow...');
    const authHandler = new TerminalAuthHandler();
    const result = await authHandler.startAuth(mainWindow);
    if (result.success) {
      log('Authentication flow started successfully');
      mainWindow?.webContents.send('auth-success');
    } else {
      log(`Authentication flow failed: ${result.error}`);
      mainWindow?.webContents.send('auth-failure', result.error);
    }
    return result;
  } catch (error: any) {
    log(`Auth start error: ${error.message}`);
    mainWindow?.webContents.send('auth-failure', error.message);
    return { success: false, error: error.message };
  }
});

// Also register as start-google-auth for preload compatibility
ipcMain.handle('start-google-auth', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    log('Starting authentication flow...');
    const authHandler = new TerminalAuthHandler();
    const result = await authHandler.startAuth(mainWindow);
    
    if (result.success) {
      log('Authentication successful');
      // Reload the window to reflect the authenticated state
      if (mainWindow) {
        mainWindow.reload();
      }
    } else {
      log(`Authentication failed: ${result.error}`);
    }
    
    return result;
  } catch (error: any) {
    log(`Auth error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Get server status
ipcMain.handle('get-server-status', async (): Promise<ServerStatus> => {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`);
    const data = await response.json();
    return {
      online: true,
      url: SERVER_URL,
      ...data
    };
  } catch (error: any) {
    return {
      online: false,
      url: SERVER_URL,
      error: error.message
    };
  }
});

// Open external link
ipcMain.handle('open-external', async (event: IpcMainInvokeEvent, url: string) => {
  log(`Opening external URL: ${url}`);
  shell.openExternal(url);
});

// Get app info
ipcMain.handle('get-app-info', async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    userData: app.getPath('userData'),
    isPackaged: app.isPackaged
  };
});

// Handle clear auth
ipcMain.handle('clear-auth', async (): Promise<{ success: boolean; error?: string }> => {
  try {
    log('Clearing authentication...');
    const authHandler = new TerminalAuthHandler();
    await authHandler.clearAuth();
    return { success: true };
  } catch (error: any) {
    log(`Clear auth error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Get user email
ipcMain.handle('get-user-email', async (): Promise<string | null> => {
  try {
    const authHandler = new TerminalAuthHandler();
    const email = await authHandler.getUserEmail();
    log(`User email: ${email}`);
    return email;
  } catch (error: any) {
    log(`Get email error: ${error.message}`);
    return null;
  }
});

// Handle recent files operations
ipcMain.handle('get-recent-files', async (): Promise<string[]> => {
  // For now, return empty array - can be implemented later
  return [];
});

ipcMain.handle('clear-recent-files', async (): Promise<void> => {
  // Implementation can be added later
  log('Clear recent files requested');
});

ipcMain.handle('remove-recent-file', async (event: IpcMainInvokeEvent, filePath: string): Promise<void> => {
  // Implementation can be added later
  log(`Remove recent file requested: ${filePath}`);
});

// Handle rate limits
ipcMain.handle('get-rate-limits', async () => {
  return {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
    tokensPerRequest: 1000000
  };
});

// Application menu
function createMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'PDF Filler',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-pdf');
            }
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/silverstein/pdf-filler-desktop');
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/silverstein/pdf-filler-desktop/issues');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle first run setup
async function handleFirstRun(): Promise<void> {
  try {
    const firstRunSetup = new FirstRunSetup();
    const isFirstRun = await firstRunSetup.isFirstRun();
    
    if (isFirstRun) {
      log('First run detected, performing setup...');
      await firstRunSetup.performSetup();
      log('First run setup completed');
    }
  } catch (error: any) {
    log(`First run setup error: ${error.message}`);
  }
}

// Initialize MCP if available
async function initializeMCP(): Promise<void> {
  try {
    log('Initializing MCP...');
    
    // First ensure MCP config exists
    await ensureMCPConfig();
    
    // Then initialize MCP manager
    mcpManager = new MCPManager();
    const initialized = await mcpManager.initialize();
    
    if (initialized) {
      log('MCP initialized successfully');
    } else {
      log('MCP initialization skipped or failed');
    }
  } catch (error: any) {
    log(`MCP initialization error: ${error.message}`);
    // MCP is optional, so don't fail the app
  }
}

// App event handlers
app.whenReady().then(async () => {
  log('App ready, initializing...');
  
  try {
    // Handle first run setup
    await handleFirstRun();
    
    // Initialize MCP
    await initializeMCP();
    
    // Start the server
    await startServer();
    
    // Create the UI
    createWindow();
    createTray();
    createMenu();
    
    log('Application initialized successfully');
  } catch (error: any) {
    log(`Initialization error: ${error.message}`);
    dialog.showErrorBox('Initialization Error', 
      `Failed to start PDF Filler: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  log('App quitting, cleaning up...');
  
  // Kill server process
  if (serverProcess) {
    log('Stopping server...');
    serverProcess.kill();
  }
  
  // Clean up MCP
  if (mcpManager) {
    mcpManager.cleanup();
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  console.error(reason);
});

export {};