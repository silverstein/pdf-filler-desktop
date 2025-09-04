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

async function copyCodexModules() {
  const source = path.join(__dirname, '../codex-cli-local');
  const dest = path.join(__dirname, '../dist/mac-arm64/PDF Filler.app/Contents/Resources/app.asar.unpacked/codex-cli-local');

  console.log('Copying Codex CLI into app bundle...');
  console.log('From:', source);
  console.log('To:', dest);

  try {
    await fs.copy(source, dest, {
      overwrite: true,
      dereference: true
    });
    console.log('✅ Codex CLI copied successfully!');
  } catch (error) {
    console.error('❌ Failed to copy Codex CLI:', error);
    process.exit(1);
  }
}

async function main() {
  await copyGeminiModules();
  await copyCodexModules();
  // Copy MCP server into unpacked bundle to guarantee stdio execution
  const mcpSrc = path.join(__dirname, '../dist/mcp');
  const mcpDest = path.join(__dirname, '../dist/mac-arm64/PDF Filler.app/Contents/Resources/app.asar.unpacked/dist/mcp');
  try {
    console.log('Copying MCP server to unpacked bundle...');
    await fs.copy(mcpSrc, mcpDest, { overwrite: true, dereference: true });
    console.log('✅ MCP server copied successfully!');
  } catch (e) {
    console.warn('⚠️  MCP server copy skipped or failed:', e && e.message ? e.message : e);
  }
}

main();
