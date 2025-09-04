import { BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

export class TerminalWindow {
  private window: BrowserWindow | null = null;
  private authProcess: any = null;
  
  constructor() {}
  
  async create(): Promise<BrowserWindow> {
    // Create a new window with mono theme styling
    this.window = new BrowserWindow({
      width: 600,
      height: 400,
      minWidth: 500,
      minHeight: 300,
      center: true,
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      title: 'Google Authentication',
      titleBarStyle: 'default',
      backgroundColor: '#000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      },
      // Remove standard window chrome for cleaner look
      frame: true,
      show: false // Show after loading
    });
    
    // Load the terminal HTML
    // In packaged app, __dirname points to app.asar/dist, so we need to go up one level
    const terminalPath = path.join(__dirname, '..', 'public', 'terminal.html');
    console.log('Loading terminal HTML from:', terminalPath);
    await this.window.loadFile(terminalPath);
    
    // Show window when ready
    this.window.once('ready-to-show', () => {
      if (this.window) {
        this.window.show();
      }
    });
    
    // Clean up on close
    this.window.on('closed', () => {
      this.cleanup();
    });
    
    return this.window;
  }

  async runScript(scriptContent: string, options?: { env?: Record<string, string>; cwd?: string; title?: string }): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.window) {
        resolve(false);
        return;
      }

      if (options?.title && !this.window.isDestroyed()) {
        this.window.setTitle(options.title);
      }

      this.window.webContents.send('status-update', 'Starting...');

      const os = require('os');
      const tempScript = path.join(os.tmpdir(), `codex-auth-${Date.now()}.sh`);
      fs.writeFileSync(tempScript, scriptContent);
      fs.chmodSync(tempScript, '755');

      const env = {
        ...process.env,
        ...(options?.env || {})
      } as Record<string, string>;

      this.authProcess = spawn('/bin/bash', [tempScript], {
        env,
        cwd: options?.cwd || process.cwd()
      });

      this.authProcess.stdout.on('data', (data: Buffer) => {
        if (this.window && !this.window.isDestroyed()) {
          const out = data.toString();
          this.window.webContents.send('terminal-output', out);
          if (/http:\/\/localhost:1455|Please visit|Open this URL/i.test(out)) {
            this.window.webContents.send('status-update', 'Opening browser for ChatGPT login...');
          }
          if (/success|authenticated|ready/i.test(out)) {
            this.window.webContents.send('status-update', 'Authentication successful!');
          }
        }
      });

      this.authProcess.stderr.on('data', (data: Buffer) => {
        if (this.window && !this.window.isDestroyed()) {
          const err = data.toString();
          if (!err.includes('DeprecationWarning') && !err.includes('node:')) {
            this.window.webContents.send('terminal-output', err);
          }
        }
      });

      this.authProcess.on('close', (code: number) => {
        setTimeout(() => {
          try { fs.unlinkSync(tempScript); } catch {}
        }, 1000);
        const success = code === 0;
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('auth-complete', success);
          if (success) {
            setTimeout(() => {
              if (this.window && !this.window.isDestroyed()) this.window.close();
            }, 3000);
          }
        }
        resolve(success);
      });

      // Timeout safeguard (5 minutes)
      setTimeout(() => {
        if (this.authProcess && !this.authProcess.killed) {
          this.authProcess.kill();
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('auth-complete', false);
          }
          resolve(false);
        }
      }, 300000);
    });
  }

  async runAuthCommand(geminiPath: string, geminiHome: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.window) {
        resolve(false);
        return;
      }
      
      // Update status
      this.window.webContents.send('status-update', 'Starting authentication...');
      
      // Check if we're in a packaged app and need to use Electron's Node with the shim
      const { app } = require('electron');
      const isPackaged = app.isPackaged;
      
      let authCommand: string;
      if (isPackaged) {
        // In packaged app, use Electron's Node with the shim
        const electronPath = process.execPath;
        const shimPath = path.join(geminiHome, 'gemini-electron-shim.js');
        
        // Create temporary script that uses Electron's Node with the shim
        const os = require('os');
        const scriptContent = `#!/bin/bash
cd '${geminiHome}'
export HOME='${geminiHome}'
export GOOGLE_GENAI_USE_GCA=true
export GOOGLE_CLOUD_PROJECT='pdf-filler-desktop'
export ELECTRON_RUN_AS_NODE=1
echo "1" | '${electronPath}' '${shimPath}' '${geminiPath}'
`;
        authCommand = scriptContent;
      } else {
        // In development, use Node directly
        const os = require('os');
        const scriptContent = `#!/bin/bash
cd '${geminiHome}'
export HOME='${geminiHome}'
export GOOGLE_GENAI_USE_GCA=true
export GOOGLE_CLOUD_PROJECT='pdf-filler-desktop'
echo "1" | '${geminiPath}'
`;
        authCommand = scriptContent;
      }
      
      const os = require('os');
      const tempScript = path.join(os.tmpdir(), `gemini-auth-${Date.now()}.sh`);
      fs.writeFileSync(tempScript, authCommand);
      fs.chmodSync(tempScript, '755');
      
      // Spawn the authentication process
      this.authProcess = spawn('/bin/bash', [tempScript], {
        env: {
          ...process.env,
          HOME: geminiHome,
          GOOGLE_GENAI_USE_GCA: 'true',
          GOOGLE_CLOUD_PROJECT: 'pdf-filler-desktop'
        },
        cwd: geminiHome
      });
      
      // Send output to the terminal window
      this.authProcess.stdout.on('data', (data: Buffer) => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('terminal-output', data.toString());
          
          // Check for success indicators
          const output = data.toString();
          if (output.includes('Please visit') || output.includes('https://accounts.google.com')) {
            this.window.webContents.send('status-update', 'Opening browser for authentication...');
          }
          if (output.includes('Successfully authenticated') || output.includes('Credentials saved')) {
            this.window.webContents.send('status-update', 'Authentication successful!');
          }
        }
      });
      
      // Handle errors
      this.authProcess.stderr.on('data', (data: Buffer) => {
        if (this.window && !this.window.isDestroyed()) {
          const error = data.toString();
          // Filter out deprecation warnings
          if (!error.includes('DeprecationWarning') && !error.includes('node:')) {
            this.window.webContents.send('terminal-output', error);
          }
        }
      });
      
      // Handle process exit
      this.authProcess.on('close', (code: number) => {
        // Clean up temp script
        setTimeout(() => {
          try {
            fs.unlinkSync(tempScript);
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 1000);
        
        const success = code === 0;
        
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('auth-complete', success);
          
          // Auto-close window after a delay if successful
          if (success) {
            setTimeout(() => {
              if (this.window && !this.window.isDestroyed()) {
                this.window.close();
              }
            }, 3000);
          }
        }
        
        resolve(success);
      });
      
      // Handle timeout (5 minutes)
      setTimeout(() => {
        if (this.authProcess && !this.authProcess.killed) {
          this.authProcess.kill();
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('auth-complete', false);
          }
          resolve(false);
        }
      }, 300000);
    });
  }
  
  cleanup() {
    if (this.authProcess && !this.authProcess.killed) {
      this.authProcess.kill();
    }
    this.window = null;
    this.authProcess = null;
  }
  
  close() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.cleanup();
  }
}

export default TerminalWindow;
