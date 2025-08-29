#!/usr/bin/env node

// Test what happens when we try to open Terminal from the packaged app
const { exec } = require('child_process');
const path = require('path');

const basePath = '/Users/silverbook/Sites/gemini-pdf-filler/dist/mac-arm64/PDF Filler.app/Contents/Resources/app.asar.unpacked';
const localGeminiPath = path.join(basePath, 'gemini-cli-local', 'node_modules', '.bin', 'gemini');
const localGeminiHome = path.join(basePath, 'gemini-cli-local');

console.log('Testing Terminal authentication...');
console.log('Gemini path:', localGeminiPath);
console.log('Gemini home:', localGeminiHome);

// Build the exact same command the app would use
const command = `cd '${localGeminiHome}' && HOME='${localGeminiHome}' '${localGeminiPath}'`;
const script = `tell application "Terminal" to do script "${command.replace(/"/g, '\\"')}"`;

console.log('\nAppleScript command:');
console.log(script);

console.log('\nExecuting AppleScript...');
exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
  if (error) {
    console.error('Failed to open Terminal:', error);
    console.error('stderr:', stderr);
    process.exit(1);
  } else {
    console.log('✅ Terminal opened successfully!');
    console.log('stdout:', stdout);
    console.log('\nThe Terminal window should now be open with the Gemini CLI.');
    console.log('If it prompts for authentication, follow the instructions.');
  }
});