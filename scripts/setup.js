#!/usr/bin/env node

const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

console.log(`
╔══════════════════════════════════════════════╗
║        PDF Filler Setup Wizard               ║
║     Free AI-Powered PDF Processing           ║
╚══════════════════════════════════════════════╝
`);

async function checkGeminiCLI() {
  return new Promise((resolve) => {
    exec('which gemini', (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}

async function checkNodeModules() {
  try {
    await fs.access(path.join(__dirname, '../node_modules'));
    return true;
  } catch {
    return false;
  }
}

async function installDependencies() {
  console.log('📦 Installing dependencies...');
  return new Promise((resolve, reject) => {
    exec('npm install', { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Failed to install dependencies:', error);
        reject(error);
      } else {
        console.log('✅ Dependencies installed successfully');
        resolve();
      }
    });
  });
}

async function setupGeminiAuth() {
  console.log(`
📝 Gemini CLI Authentication Required
  
To use Gemini CLI, you need to authenticate with your Google account.
This will open your browser to complete the authentication.

Run: gemini auth login

After authentication, run: gemini auth list
to verify you're logged in.
`);
  
  const proceed = await question('Have you completed Gemini authentication? (y/n): ');
  return proceed.toLowerCase() === 'y';
}

async function createEnvFile() {
  const envPath = path.join(__dirname, '../.env');
  
  try {
    await fs.access(envPath);
    console.log('✅ .env file already exists');
  } catch {
    const envContent = `# PDF Filler Configuration
PORT=3456

# Rate Limiting (adjust based on your usage)
MAX_REQUESTS_PER_MINUTE=50
MAX_REQUESTS_PER_DAY=900

# File Upload Limits
MAX_FILE_SIZE_MB=50
`;
    
    await fs.writeFile(envPath, envContent);
    console.log('✅ Created .env configuration file');
  }
}

async function createDesktopShortcut() {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS
    const scriptContent = `#!/bin/bash
cd "${path.join(__dirname, '..')}"
npm run electron
`;
    
    const desktopPath = path.join(process.env.HOME, 'Desktop', 'PDF Filler.command');
    await fs.writeFile(desktopPath, scriptContent);
    await fs.chmod(desktopPath, '755');
    console.log('✅ Created desktop shortcut (macOS)');
  } else if (platform === 'win32') {
    // Windows
    console.log('ℹ️  To create a desktop shortcut on Windows:');
    console.log('   Right-click on desktop → New → Shortcut');
    console.log(`   Target: ${process.execPath} ${path.join(__dirname, '../src/electron.js')}`);
  } else {
    // Linux
    const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=PDF Filler
Comment=Free AI-Powered PDF Processing
Exec=${process.execPath} ${path.join(__dirname, '../src/electron.js')}
Icon=${path.join(__dirname, '../assets/icon.png')}
Terminal=false
Categories=Office;Utility;
`;
    
    const desktopPath = path.join(process.env.HOME, '.local/share/applications', 'pdf-filler-desktop.desktop');
    await fs.mkdir(path.dirname(desktopPath), { recursive: true });
    await fs.writeFile(desktopPath, desktopEntry);
    console.log('✅ Created desktop entry (Linux)');
  }
}

async function main() {
  try {
    // Step 1: Check Gemini CLI
    console.log('\n📍 Step 1: Checking Gemini CLI...');
    const hasGemini = await checkGeminiCLI();
    
    if (!hasGemini) {
      console.log(`
❌ Gemini CLI is not installed!

To install Gemini CLI:
1. Visit: https://github.com/google/generative-ai-docs
2. Follow the installation instructions for your platform
3. Run this setup again after installation

For macOS/Linux:
  curl -sSL https://gemini.google.com/cli/install.sh | bash

For Windows:
  Download the installer from the GitHub releases page
`);
      
      const proceed = await question('Continue without Gemini CLI? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        process.exit(1);
      }
    } else {
      console.log('✅ Gemini CLI is installed');
      
      // Check authentication
      const authComplete = await setupGeminiAuth();
      if (!authComplete) {
        console.log('⚠️  Please complete Gemini authentication before using the app');
      }
    }
    
    // Step 2: Install dependencies
    console.log('\n📍 Step 2: Checking dependencies...');
    const hasModules = await checkNodeModules();
    
    if (!hasModules) {
      await installDependencies();
    } else {
      console.log('✅ Dependencies already installed');
    }
    
    // Step 3: Create config files
    console.log('\n📍 Step 3: Setting up configuration...');
    await createEnvFile();
    
    // Step 4: Create desktop shortcut
    console.log('\n📍 Step 4: Creating desktop shortcut...');
    const createShortcut = await question('Create desktop shortcut? (y/n): ');
    if (createShortcut.toLowerCase() === 'y') {
      await createDesktopShortcut();
    }
    
    // Complete!
    console.log(`
╔══════════════════════════════════════════════╗
║           ✅ Setup Complete!                 ║
╚══════════════════════════════════════════════╝

🚀 To start the application:

   Option 1 - Web Interface:
   npm start
   Then open: http://localhost:3456

   Option 2 - Desktop App:
   npm run electron

📖 Usage Limits (Free Tier):
   • 60 requests per minute
   • 1,000 requests per day
   • 1M token context window

🔧 Configuration:
   Edit .env file to adjust settings

📚 Documentation:
   See README.md for detailed usage

Enjoy free PDF processing with Gemini AI! 🎉
`);
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();