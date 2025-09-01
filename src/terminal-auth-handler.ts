import { shell, app } from 'electron';
import { spawn, exec } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import TerminalWindow from './terminal-window';

interface AuthStatus {
  authenticated: boolean;
  email?: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

export class TerminalAuthHandler {
  private localGeminiPath: string;
  private localGeminiHome: string;
  private credPath: string;
  private accountsPath: string;

  constructor() {
    // Fix path resolution for packaged app
    const isDev = !app.isPackaged;
    
    // In packaged app, files in asarUnpack are in app.asar.unpacked
    const basePath = isDev 
      ? path.join(__dirname, '..')
      : path.join(process.resourcesPath, 'app.asar.unpacked');
    
    // Use the actual Gemini CLI file instead of the symlink (which breaks in packaged apps)
    this.localGeminiPath = path.join(basePath, 'gemini-cli-local', 'node_modules', '@google', 'gemini-cli', 'dist', 'index.js');
    this.localGeminiHome = path.join(basePath, 'gemini-cli-local');
    this.credPath = path.join(this.localGeminiHome, '.gemini', 'oauth_creds.json');
    this.accountsPath = path.join(this.localGeminiHome, '.gemini', 'google_accounts.json');
    
    console.log('TerminalAuthHandler initialized:');
    console.log('  isDev:', isDev);
    console.log('  basePath:', basePath);
    console.log('  localGeminiPath:', this.localGeminiPath);
    console.log('  localGeminiHome:', this.localGeminiHome);
  }

  async checkAuthStatus(): Promise<AuthStatus> {
    try {
      // Check if OAuth credentials exist in local Gemini home
      await fs.access(this.credPath);
      
      try {
        const accounts = JSON.parse(await fs.readFile(this.accountsPath, 'utf8'));
        const email = accounts.active || accounts.default || 
                     (accounts.accounts && accounts.accounts[0]?.email) || 
                     'authenticated';
        return {
          authenticated: true,
          email: email
        };
      } catch {
        // Credentials exist but can't read account details
        return {
          authenticated: true,
          email: 'authenticated'
        };
      }
    } catch {
      return {
        authenticated: false
      };
    }
  }

  async checkExistingAuth(): Promise<boolean> {
    const status = await this.checkAuthStatus();
    return status.authenticated;
  }

  async startAuth(mainWindow?: any): Promise<AuthResult> {
    console.log('Starting Terminal-based authentication...');
    console.log('localGeminiPath:', this.localGeminiPath);
    console.log('localGeminiHome:', this.localGeminiHome);
    
    const platform = process.platform;
    
    // Try to use our custom terminal window first (macOS and Linux)
    if (platform === 'darwin' || platform === 'linux') {
      try {
        console.log('Opening custom terminal window for authentication...');
        
        const terminalWindow = new TerminalWindow();
        await terminalWindow.create();
        
        const success = await terminalWindow.runAuthCommand(
          this.localGeminiPath,
          this.localGeminiHome
        );
        
        if (success) {
          console.log('Authentication successful via custom terminal!');
          return { success: true };
        } else {
          console.log('Authentication failed or timed out');
          return { success: false, error: 'Authentication failed or timed out' };
        }
      } catch (error) {
        console.error('Failed to use custom terminal window, falling back to system terminal:', error);
        // Fall back to system terminal if custom window fails
      }
    }
    
    // Fallback to system terminal (or Windows default)
    if (platform === 'darwin') {
      // macOS fallback - Open Terminal app with the gemini command
      const fs = require('fs');
      const os = require('os');
      
      // Create a temporary shell script that auto-selects option 1 (Login with Google)
      const scriptContent = `#!/bin/bash
cd '${this.localGeminiHome}'
export HOME='${this.localGeminiHome}'
# Set auth method to use Google Cloud Auth (OAuth flow)
export GOOGLE_GENAI_USE_GCA=true
# Echo "1" to select "Login with Google" option automatically
echo "1" | '${this.localGeminiPath}'
`;
      
      const tempScript = path.join(os.tmpdir(), `gemini-auth-${Date.now()}.sh`);
      fs.writeFileSync(tempScript, scriptContent);
      fs.chmodSync(tempScript, '755');
      
      console.log('Opening Terminal with script:', tempScript);
      
      // Open Terminal with the script
      exec(`open -a Terminal "${tempScript}"`, (error, _stdout, stderr) => {
        if (error) {
          console.error('Failed to open Terminal:', error);
          console.error('stderr:', stderr);
        } else {
          console.log('Terminal opened with gemini CLI');
          // Clean up temp file after a delay
          setTimeout(() => {
            try {
              fs.unlinkSync(tempScript);
            } catch (e) {
              // Ignore cleanup errors
            }
          }, 5000);
        }
      });
    } else if (platform === 'win32') {
      // Windows - Use PowerShell/Command Prompt
      const command = `cd /d "${this.localGeminiHome}" && set HOME="${this.localGeminiHome}" && "${this.localGeminiPath}"`;
      exec(`start cmd /k "${command}"`, (error) => {
        if (error) {
          console.error('Failed to open Command Prompt:', error);
        }
      });
    } else {
      // Linux - Try common terminal emulators
      const command = `cd '${this.localGeminiHome}' && HOME='${this.localGeminiHome}' '${this.localGeminiPath}'`;
      exec(`xterm -e "${command}" || gnome-terminal -- bash -c "${command}" || konsole -e "${command}"`, (error) => {
        if (error) {
          console.error('Failed to open terminal:', error);
        }
      });
    }

    // Monitor for auth completion
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 60; // 5 minutes (5 second intervals)
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        
        const status = await this.checkAuthStatus();
        if (status.authenticated) {
          clearInterval(checkInterval);
          console.log('Authentication successful! Email:', status.email);
          resolve({ success: true });
        } else if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          console.log('Authentication timeout');
          resolve({ success: false, error: 'Authentication timeout' });
        }
      }, 5000);
    });
  }

  async clearAuth(): Promise<void> {
    try {
      // Remove the credential files
      await fs.unlink(this.credPath).catch(() => {});
      await fs.unlink(this.accountsPath).catch(() => {});
      console.log('Authentication cleared successfully');
    } catch (error) {
      console.error('Error clearing auth:', error);
      throw error;
    }
  }

  async getUserEmail(): Promise<string | null> {
    const status = await this.checkAuthStatus();
    return status.email || null;
  }
}

export default TerminalAuthHandler;