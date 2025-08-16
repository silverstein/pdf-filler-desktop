#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function copyGeminiModules() {
  const source = path.join(__dirname, '../gemini-cli-local/node_modules');
  const dest = path.join(__dirname, '../dist/mac-arm64/PDF Filler.app/Contents/Resources/app.asar.unpacked/gemini-cli-local/node_modules');
  
  console.log('Copying Gemini CLI node_modules to app bundle...');
  console.log('From:', source);
  console.log('To:', dest);
  
  try {
    await fs.copy(source, dest, {
      overwrite: true,
      dereference: true
    });
    console.log('✅ Gemini CLI modules copied successfully!');
  } catch (error) {
    console.error('❌ Failed to copy Gemini modules:', error);
    process.exit(1);
  }
}

copyGeminiModules();