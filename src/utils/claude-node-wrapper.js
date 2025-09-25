#!/usr/bin/env node
/**
 * Node.js wrapper for Claude CLI
 * This ensures Claude CLI can run properly by providing Node.js in the environment
 * Similar to how we handle Gemini CLI with the electron shim
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Get the actual Claude CLI path from arguments
const claudePath = process.argv[2];
if (!claudePath) {
  console.error('Error: Claude CLI path not provided');
  process.exit(1);
}

// Get the remaining arguments to pass to Claude
const claudeArgs = process.argv.slice(3);

// Build enhanced PATH with common Node.js locations
const enhancedPath = [
  process.env.PATH,
  '/usr/local/bin',
  '/opt/homebrew/bin',
  path.join(os.homedir(), '.nvm/versions/node/*/bin'),
  path.join(os.homedir(), '.local/bin'),
  // Add npm global bin paths
  '/usr/local/lib/node_modules/.bin',
  path.join(os.homedir(), '.npm-global/bin')
].filter(Boolean).join(':');

// Set up environment
const env = {
  ...process.env,
  PATH: enhancedPath,
  HOME: os.homedir()
};

// Spawn Claude with proper environment
const claude = spawn(claudePath, claudeArgs, {
  env,
  cwd: os.homedir(),
  stdio: 'inherit' // Pass through all I/O
});

// Handle exit
claude.on('error', (err) => {
  console.error('Failed to start Claude:', err.message);
  process.exit(1);
});

claude.on('exit', (code) => {
  process.exit(code || 0);
});