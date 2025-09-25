#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

async function testClaudeAuth() {
  console.log('Testing Claude authentication flow...\n');
  
  // Import the handler
  const { ClaudeAuthHandler } = require('./dist/claude-auth-handler');
  
  const handler = new ClaudeAuthHandler();
  
  // Check current status
  console.log('Checking current authentication status...');
  const status = await handler.checkAuthStatus();
  console.log('Status:', status);
  
  if (status.authenticated) {
    console.log('\n✓ Claude is already authenticated!');
    return;
  }
  
  // Try to authenticate
  console.log('\nStarting authentication...');
  const result = await handler.startAuth();
  
  if (result.success) {
    console.log('\n✓ Authentication successful!');
  } else {
    console.log('\n✗ Authentication failed:', result.error);
  }
}

testClaudeAuth().catch(console.error);