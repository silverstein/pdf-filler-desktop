const { BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class FirstRunSetup {
  constructor() {
    this.localGeminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
    this.localGeminiConfig = path.join(__dirname, '../gemini-cli-local/.gemini');
  }

  async checkIfFirstRun() {
    try {
      // Check if local Gemini CLI is installed
      await fs.access(this.localGeminiPath);
      
      // For now, skip auth check since Gemini CLI handles auth differently
      // Just check if CLI is installed
      return false; // Not first run if CLI exists
    } catch {
      return true; // First run - needs setup
    }
  }

  async installLocalGemini() {
    return new Promise((resolve, reject) => {
      console.log('Installing local Gemini CLI...');
      
      const install = spawn('npm', ['install', '@google/gemini-cli', '--prefix', './gemini-cli-local'], {
        cwd: path.join(__dirname, '..'),
        shell: true
      });

      install.stdout.on('data', (data) => {
        console.log(`Install: ${data}`);
      });

      install.stderr.on('data', (data) => {
        console.error(`Install error: ${data}`);
      });

      install.on('close', (code) => {
        if (code === 0) {
          console.log('Gemini CLI installed successfully');
          resolve();
        } else {
          reject(new Error('Failed to install Gemini CLI'));
        }
      });
    });
  }

  async setupAuthentication() {
    return new Promise((resolve, reject) => {
      // Create a setup window
      const setupWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
        title: 'PDF Filler - Setup'
      });

      // Load setup HTML
      setupWindow.loadURL(`data:text/html,
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 20px;
              backdrop-filter: blur(10px);
              max-width: 500px;
            }
            h1 { margin-bottom: 1rem; }
            p { margin: 1rem 0; line-height: 1.6; }
            .button {
              background: white;
              color: #667eea;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              margin: 1rem;
            }
            .button:hover {
              transform: scale(1.05);
            }
            .status {
              margin-top: 2rem;
              padding: 1rem;
              background: rgba(255, 255, 255, 0.2);
              border-radius: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome to PDF Filler!</h1>
            <p>To use this app, you need to authenticate with your Google account.</p>
            <p><strong>Important:</strong> Use a personal Gmail account for best results.<br>
            Workspace accounts may require additional configuration.</p>
            
            <button class="button" onclick="startAuth()">
              Sign in with Google
            </button>
            
            <div class="status" id="status" style="display: none;">
              <p>Opening browser for authentication...</p>
              <p>Please complete the sign-in process in your browser.</p>
              <p>This window will close automatically when done.</p>
            </div>
          </div>
          
          <script>
            const { ipcRenderer } = require('electron');
            
            function startAuth() {
              document.getElementById('status').style.display = 'block';
              ipcRenderer.send('start-auth');
            }
            
            ipcRenderer.on('auth-complete', () => {
              window.close();
            });
          </script>
        </body>
        </html>
      `);

      // Handle auth button click
      setupWindow.webContents.on('ipc-message', (event, channel) => {
        if (channel === 'start-auth') {
          // Launch Gemini CLI auth
          const authProcess = spawn(this.localGeminiPath, ['auth', 'login'], {
            env: {
              ...process.env,
              HOME: path.join(__dirname, '../gemini-cli-local'), // Use local home for config
              GEMINI_HOME: this.localGeminiConfig
            }
          });

          authProcess.on('close', (code) => {
            if (code === 0) {
              setupWindow.webContents.send('auth-complete');
              setTimeout(() => {
                setupWindow.close();
                resolve();
              }, 1000);
            } else {
              reject(new Error('Authentication failed'));
            }
          });
        }
      });

      setupWindow.on('closed', () => {
        // Check if auth was successful
        const configPath = path.join(this.localGeminiConfig, 'oauth_creds.json');
        fs.access(configPath)
          .then(() => resolve())
          .catch(() => reject(new Error('Setup cancelled')));
      });
    });
  }

  async runSetup() {
    const firstRun = await this.checkIfFirstRun();
    
    if (!firstRun) {
      console.log('Gemini CLI already configured');
      return true;
    }

    try {
      // Step 1: Install local Gemini CLI
      await this.installLocalGemini();
      
      // Step 2: Setup authentication
      await this.setupAuthentication();
      
      console.log('Setup complete!');
      return true;
    } catch (error) {
      console.error('Setup failed:', error);
      dialog.showErrorBox('Setup Failed', error.message);
      return false;
    }
  }
}

module.exports = FirstRunSetup;