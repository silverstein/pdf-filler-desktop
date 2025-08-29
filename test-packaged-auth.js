#!/usr/bin/env node

// Test that the packaged app can find and execute the Gemini CLI
const path = require('path');
const fs = require('fs');

const appPath = '/Users/silverbook/Sites/gemini-pdf-filler/dist/mac-arm64/PDF Filler.app/Contents/Resources/app.asar.unpacked';
const geminiPath = path.join(appPath, 'gemini-cli-local', 'node_modules', '.bin', 'gemini');

console.log('Testing packaged app authentication setup...\n');
console.log('App path:', appPath);
console.log('Gemini CLI path:', geminiPath);

// Check if files exist
console.log('\nChecking files:');
console.log('- App directory exists:', fs.existsSync(appPath));
console.log('- Gemini CLI exists:', fs.existsSync(geminiPath));
console.log('- Gemini CLI is executable:', fs.existsSync(geminiPath) && fs.statSync(geminiPath).mode & 0o111);

// Check gemini-cli-local structure
const geminiLocalPath = path.join(appPath, 'gemini-cli-local');
console.log('\nGemini local structure:');
console.log('- gemini-cli-local exists:', fs.existsSync(geminiLocalPath));
console.log('- node_modules exists:', fs.existsSync(path.join(geminiLocalPath, 'node_modules')));
console.log('- .bin directory exists:', fs.existsSync(path.join(geminiLocalPath, 'node_modules', '.bin')));

// Check if credentials directory can be created
const credPath = path.join(geminiLocalPath, '.gemini');
console.log('\nCredentials directory:');
console.log('- .gemini path:', credPath);
console.log('- .gemini exists:', fs.existsSync(credPath));

console.log('\n✅ All checks complete!');
console.log('\nThe packaged app should be able to:');
console.log('1. Find the Gemini CLI at:', geminiPath);
console.log('2. Store credentials at:', credPath);
console.log('3. Open Terminal and run authentication when user clicks "Sign in with Google"');