#!/usr/bin/env node
const os = require('os');

// Force bundled mode to test
process.env.ELECTRON_RUN_AS_NODE = '1';
process.env.GEMINI_CLI_NO_RELAUNCH = '1';

const argv = process.argv.slice(2);
const scriptPath = argv[0];
const scriptArgs = argv.slice(1);

// FORCE bundled mode - only include args, not script path
process.argv = [process.execPath, ...scriptArgs];

console.error('[TEST] Forced bundled mode argv:', JSON.stringify(process.argv));

import(scriptPath).catch(err => {
  console.error('[TEST] Failed:', err.message);
  process.exit(1);
});
