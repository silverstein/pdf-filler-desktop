const { shell, app } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class SimpleAuthHandler {
  constructor() {
    this.localGeminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
    this.localGeminiHome = path.join(__dirname, '../gemini-cli-local');
  }

  async checkAuthStatus() {
    try {
      // Check if OAuth credentials exist in local Gemini home
      const oauthPath = path.join(this.localGeminiHome, '.gemini', 'oauth_creds.json');
      const accountsPath = path.join(this.localGeminiHome, '.gemini', 'google_accounts.json');
      
      await fs.access(oauthPath);
      
      try {
        const accounts = JSON.parse(await fs.readFile(accountsPath, 'utf8'));
        return {
          authenticated: true,
          email: accounts.active || 'unknown'
        };
      } catch {
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

  async startAuth(mainWindow) {
    // For macOS, we'll use AppleScript to open Terminal and run the auth command
    // For Windows, we'll use PowerShell
    // For Linux, we'll use xterm or gnome-terminal
    
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS - Use AppleScript to open Terminal
      // Need to escape the quotes properly for AppleScript
      const command = `cd '${this.localGeminiHome}' && HOME='${this.localGeminiHome}' '${this.localGeminiPath}'`;
      const script = `tell application "Terminal" to do script "${command.replace(/"/g, '\\"')}"`;
      
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('Failed to open Terminal:', error);
          if (mainWindow) {
            mainWindow.webContents.send('auth-failure', error.message);
          }
        } else {
          console.log('Terminal opened for authentication');
          if (mainWindow) {
            // Send the initial event
            mainWindow.webContents.send('auth-terminal-opened');
            
            // Start polling for auth completion
            let checkCount = 0;
            const maxChecks = 60; // Check for 5 minutes (60 * 5 seconds)
            
            const checkInterval = setInterval(async () => {
              checkCount++;
              const status = await this.checkAuthStatus();
              
              if (status.authenticated) {
                console.log('Authentication detected:', status.email);
                clearInterval(checkInterval);
                mainWindow.webContents.send('auth-success');
              } else if (checkCount >= maxChecks) {
                console.log('Authentication timeout');
                clearInterval(checkInterval);
                mainWindow.webContents.send('auth-timeout');
              }
            }, 5000); // Check every 5 seconds
          }
        }
      });
      
    } else if (platform === 'win32') {
      // Windows - Use PowerShell
      exec(`start powershell -Command "cd '${this.localGeminiHome}'; $env:HOME='${this.localGeminiHome}'; & '${this.localGeminiPath}'"`, (error) => {
        if (error) {
          console.error('Failed to open PowerShell:', error);
        }
      });
      
    } else {
      // Linux - Try common terminal emulators
      const terminals = ['gnome-terminal', 'xterm', 'konsole', 'xfce4-terminal'];
      let terminalOpened = false;
      
      for (const terminal of terminals) {
        try {
          exec(`which ${terminal}`, (error) => {
            if (!error && !terminalOpened) {
              terminalOpened = true;
              exec(`${terminal} -e "bash -c 'cd ${this.localGeminiHome} && HOME=${this.localGeminiHome} ${this.localGeminiPath}; read -p \\"Press Enter to close...\\"'"`, (error) => {
                if (error) {
                  console.error(`Failed to open ${terminal}:`, error);
                }
              });
            }
          });
        } catch (e) {
          console.error(`Terminal ${terminal} not found`);
        }
      }
    }
    
    return true;
  }

  async clearAuth() {
    try {
      const geminiDir = path.join(this.localGeminiHome, '.gemini');
      await fs.rm(path.join(geminiDir, 'oauth_creds.json'), { force: true });
      await fs.rm(path.join(geminiDir, 'google_accounts.json'), { force: true });
      console.log('Authentication cleared');
    } catch (error) {
      console.error('Failed to clear auth:', error);
    }
  }
}

module.exports = SimpleAuthHandler;