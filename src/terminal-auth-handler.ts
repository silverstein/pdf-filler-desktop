import { shell, app } from 'electron';
import { spawn, exec } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

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
    const basePath = isDev 
      ? path.join(__dirname, '..')
      : path.join(process.resourcesPath, 'app');
    
    this.localGeminiPath = path.join(basePath, 'gemini-cli-local', 'node_modules', '.bin', 'gemini');
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
    
    // For macOS, we'll use AppleScript to open Terminal and run gemini
    // The gemini CLI will handle the OAuth flow when it detects no credentials
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS - Use AppleScript to open Terminal with gemini command
      // Just run gemini interactively - it will prompt for auth if needed
      const command = `cd '${this.localGeminiHome}' && HOME='${this.localGeminiHome}' '${this.localGeminiPath}'`;
      const script = `tell application "Terminal" to do script "${command.replace(/"/g, '\\"')}"`;
      
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('Failed to open Terminal:', error);
        } else {
          console.log('Terminal opened with gemini CLI');
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