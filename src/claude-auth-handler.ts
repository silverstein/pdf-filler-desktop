import { exec, spawn, execFile } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import TerminalWindow from './terminal-window';
import { app } from 'electron';

interface ClaudeAuthStatus {
  installed: boolean;
  authenticated: boolean;
  detail?: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Handler for Claude Code CLI authentication ("Sign in with Claude").
 * - Detects Claude Code CLI binary
 * - Launches terminal window to run `claude login`
 * - Polls for authentication status
 * - Uses claude.ai Pro/Max account (not API keys)
 */
export class ClaudeAuthHandler {
  private cachedClaudePath: string | null = null;
  private authCheckCache: { authenticated: boolean; timestamp: number } | null = null;
  private CACHE_DURATION = 60000; // 1 minute cache for auth checks

  async findClaudeBinary(): Promise<string | null> {
    if (this.cachedClaudePath) return this.cachedClaudePath;

    // Allow explicit override
    if (process.env.CLAUDE_CLI_PATH) {
      try {
        await fs.access(process.env.CLAUDE_CLI_PATH);
        this.cachedClaudePath = process.env.CLAUDE_CLI_PATH;
        return this.cachedClaudePath;
      } catch {}
    }

    const platform = process.platform;

    // Common locations for Claude Code
    const candidates: string[] = [];
    
    if (platform === 'darwin' || platform === 'linux') {
      // Check user-specific locations first
      const home = os.homedir();
      candidates.push(
        path.join(home, '.local', 'bin', 'claude'),
        path.join(home, 'bin', 'claude'),
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        '/usr/bin/claude',
        '/bin/claude'
      );
    } else if (platform === 'win32') {
      // Windows locations
      const home = os.homedir();
      candidates.push(
        path.join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
        path.join(home, '.local', 'bin', 'claude.exe'),
        'C:/Program Files/Claude/claude.exe',
        'C:/Program Files (x86)/Claude/claude.exe'
      );
    }

    // Try to access each candidate
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        this.cachedClaudePath = candidate;
        return candidate;
      } catch {
        // Continue checking
      }
    }

    // PATH lookup using 'which' or 'where'
    const pathLookup = await new Promise<string | null>((resolve) => {
      const cmd = platform === 'win32' ? 'where' : 'which';
      const proc = spawn(cmd, ['claude']);
      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', () => {
        const line = out.split('\n').map((s) => s.trim()).find((l) => !!l);
        resolve(line || null);
      });
      proc.on('error', () => resolve(null));
    });

    if (pathLookup) {
      try {
        await fs.access(pathLookup);
        this.cachedClaudePath = pathLookup;
        return pathLookup;
      } catch {}
    }

    return null;
  }

  async checkAuthStatus(): Promise<ClaudeAuthStatus> {
    const claude = await this.findClaudeBinary();
    if (!claude) {
      return { 
        installed: false, 
        authenticated: false, 
        detail: 'Claude Code not found. Please install from claude.ai/code' 
      };
    }

    // Check cache first
    if (this.authCheckCache && 
        Date.now() - this.authCheckCache.timestamp < this.CACHE_DURATION) {
      return { 
        installed: true, 
        authenticated: this.authCheckCache.authenticated,
        detail: this.authCheckCache.authenticated ? 'Authenticated' : 'Not authenticated'
      };
    }

    // OAuth tokens from setup-token are for API access, not CLI
    // We need to check if Claude CLI itself is authenticated
    // Remove the false positive OAuth token check

    // Active probe: Try to execute a simple command with timeout
    // This tests if Claude is authenticated and responsive
    // Use stdin to send prompt to Claude (more reliable than command line args)
    const isAuthenticated = await new Promise<boolean>((resolve) => {
      const args = ['-p'];  // Print mode only
      
      console.log('Checking Claude auth by running:', claude, args);
      
      const child = spawn(claude, args, {
        env: {
          ...process.env,
          HOME: os.homedir()
        },
        cwd: os.homedir()
      });
      
      let output = '';
      let error = '';
      let timeout: NodeJS.Timeout;
      
      // Set timeout
      timeout = setTimeout(() => {
        console.log('Claude auth check timeout');
        child.kill();
        resolve(false);
      }, 10000);
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('close', (code) => {
        clearTimeout(timeout);
        console.log('Claude auth check complete. Code:', code);
        console.log('Output:', output);
        if (code === 0 && output.includes('2')) {
          resolve(true);
        } else {
          console.log('Auth check failed. Error:', error);
          resolve(false);
        }
      });
      
      child.on('error', (err) => {
        clearTimeout(timeout);
        console.log('Failed to spawn Claude:', err.message);
        resolve(false);
      });
      
      // Send the test prompt via stdin
      child.stdin.write('What is 1+1? Answer with just the number.\n');
      child.stdin.end();
    });

    // Update cache
    this.authCheckCache = {
      authenticated: isAuthenticated,
      timestamp: Date.now()
    };

    return { 
      installed: true, 
      authenticated: isAuthenticated,
      detail: isAuthenticated ? 'Authenticated with claude.ai' : 'Not authenticated - run claude setup-token'
    };
  }

  async clearAuth(): Promise<void> {
    // Claude doesn't have a logout command, but we can clear the stored credentials
    try {
      const home = os.homedir();
      const claudeConfigPath = path.join(home, '.claude');

      // Clear auth cache
      this.authCheckCache = null;
      this.cachedClaudePath = null;

      // Note: Claude stores its authentication in a way that's not easily cleared
      // without affecting the main Claude Code application.
      // The best way to logout is to use the Claude Code app itself.
      console.log('Claude logout: Please use Claude Code app to fully logout');
      console.log('Local cache cleared, but OAuth tokens remain in system keychain');

      // We could potentially remove OAuth tokens from keychain on macOS:
      // exec('security delete-generic-password -s "claude-oauth" 2>/dev/null', () => {});
      // But this is risky as it might affect the main Claude Code app
    } catch (error) {
      console.error('Failed to clear Claude auth:', error);
    }
  }

  async startAuth(): Promise<AuthResult> {
    const claude = await this.findClaudeBinary();
    if (!claude) {
      return { 
        success: false, 
        error: 'Claude Code not found. Please install Claude Code from claude.ai/code first.' 
      };
    }

    console.log('Starting Claude authentication with setup-token...');
    
    // Check if already authenticated
    const status = await this.checkAuthStatus();
    if (status.authenticated) {
      console.log('Claude is already authenticated!');
      return { success: true };
    }
    
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // IMPORTANT: Must use real Terminal app, not our Electron window
      // Claude's interactive UI will break in our custom terminal
      const tmp = os.tmpdir();
      const scriptPath = path.join(tmp, `claude-auth-${Date.now()}.sh`);
      
      const scriptContent = `#!/bin/bash
echo "========================================="
echo "       Claude Code Authentication"
echo "========================================="
echo ""
echo "IMPORTANT: This app needs Claude Code to be authenticated"
echo "for interactive CLI usage, not just an OAuth token."
echo ""
echo "Please follow these steps:"
echo "1. Open a new Terminal window"
echo "2. Run: claude"
echo "3. If prompted, authenticate with your Claude account"
echo "4. Once Claude is working, close this window"
echo ""
echo "Testing Claude authentication..."

# Test if Claude CLI is working
if echo "test" | "${claude}" -p 2>/dev/null | grep -q "test"; then
  echo "✓ Claude is already authenticated and working!"
  echo ""
  echo "You can close this window."
  exit 0
else
  echo "✗ Claude is not authenticated for CLI use"
  echo ""
  echo "Opening Claude for authentication..."
  echo "Please authenticate in the Terminal that opens."
  echo ""
  
  # Open Claude in a new Terminal for proper authentication
  osascript -e 'tell app "Terminal" to do script "claude"' 2>/dev/null || \
    open -a Terminal -n --args "${claude}"
  
  echo "After authenticating Claude, press any key to continue..."
  read -n 1 -s
  
  # Test again
  if echo "test" | "${claude}" -p 2>/dev/null | grep -q "test"; then
    echo "✓ Claude authentication successful!"
    exit 0
  else
    echo "✗ Claude still not authenticated"
    echo "Please complete authentication manually"
    exit 1
  fi
fi
`;
      
      await fs.writeFile(scriptPath, scriptContent, { encoding: 'utf8' });
      await fs.chmod(scriptPath, 0o755);
      
      console.log('Opening Terminal app for Claude authentication...');
      
      // Open in macOS Terminal app which supports raw mode
      exec(`open -a Terminal "${scriptPath}"`, (error) => {
        if (error) {
          console.error('Failed to open Terminal:', error);
        } else {
          console.log('Terminal opened for Claude authentication');
          // Clean up script after delay
          setTimeout(() => {
            fs.unlink(scriptPath).catch(() => {});
          }, 10000);
        }
      });
    } else if (platform === 'linux') {
      // On Linux, try to use a real terminal emulator
      const tmp = os.tmpdir();
      const scriptPath = path.join(tmp, `claude-auth-${Date.now()}.sh`);
      
      const scriptContent = `#!/bin/bash
echo "========================================="
echo "       Claude Code Authentication"
echo "========================================="
echo ""
echo "Starting Claude authentication..."
echo ""
echo "This will open your browser to sign in with your Claude account."
echo "Make sure you have a Claude Pro or Max subscription."
echo ""

# Run claude setup-token command
"${claude}" setup-token

# Check if authentication succeeded
if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Authentication completed!"
  echo ""
  echo "You can close this window now."
  read -p "Press Enter to close..."
  exit 0
else
  echo ""
  echo "✗ Authentication failed or was cancelled"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi
`;
      
      await fs.writeFile(scriptPath, scriptContent, { encoding: 'utf8' });
      await fs.chmod(scriptPath, 0o755);
      
      // Try various terminal emulators
      const command = `"${scriptPath}"; read -p "Press Enter to close..."`;
      exec(`xterm -e bash -c '${command}' || gnome-terminal -- bash -c '${command}' || konsole -e bash -c '${command}' || x-terminal-emulator -e bash -c '${command}'`, (error) => {
        if (error) {
          console.error('Failed to open terminal:', error);
        }
        // Clean up script after delay
        setTimeout(() => {
          fs.unlink(scriptPath).catch(() => {});
        }, 10000);
      });
    }
    
    // Fallback: Open system terminal (Windows or if custom terminal fails)
    if (platform === 'win32') {
      const tmp = os.tmpdir();
      const scriptPath = path.join(tmp, `claude-auth-${Date.now()}.cmd`);
      const content = `@echo off
echo =========================================
echo        Claude Code Authentication
echo =========================================
echo.
echo Starting Claude authentication...
echo.
echo This will open your browser to sign in with your Claude account.
echo Make sure you have a Claude Pro or Max subscription.
echo.
"${claude}" setup-token
if %ERRORLEVEL% EQU 0 (
  echo.
  echo Authentication completed successfully!
) else (
  echo.
  echo Authentication failed or was cancelled.
)
pause
`;
      await fs.writeFile(scriptPath, content, 'utf8');
      
      await new Promise<void>((resolve) => {
        exec(`start cmd /k "${scriptPath}"`, () => resolve());
      });
    } else {
      // Linux fallback
      const command = `"${claude}" setup-token`;
      exec(`xterm -e "${command}" || gnome-terminal -- bash -c "${command}; read" || konsole -e "${command}"`, (error) => {
        if (error) {
          console.error('Failed to open terminal:', error);
        }
      });
    }

    // Poll for authentication success (up to 5 minutes)
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    while (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
      
      const status = await this.checkAuthStatus();
      if (status.installed && status.authenticated) {
        console.log('Claude authentication successful!');
        return { success: true };
      }
    }
    
    return { success: false, error: 'Authentication timeout - please try again' };
  }

  async getUserInfo(): Promise<string | null> {
    const status = await this.checkAuthStatus();
    if (status.authenticated) {
      // Claude doesn't expose email directly, but we can indicate it's authenticated
      return 'Claude Pro/Max User';
    }
    return null;
  }
}

export default ClaudeAuthHandler;