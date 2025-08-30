#!/usr/bin/env node
/**
 * Electron & yargs compatibility shim for Gemini CLI (ESM version)
 *
 * Purpose:
 * - Ensure yargs(hideBin(process.argv)) inside the Gemini CLI sees the expected
 *   shape: [execPath, <CLI entry file>, ...userArgs]
 * - Avoids "Unknown argument: <path-to-index.js>" when launching via ELECTRON_RUN_AS_NODE
 *
 * Usage:
 *   electron (with ELECTRON_RUN_AS_NODE=1) <this-shim> <path-to-gemini-cli/index.js> ...args
 *
 * This script:
 *   1) Extracts the target script path from process.argv[2]
 *   2) Rewrites process.argv to [process.execPath, scriptPath, ...rest]
 *   3) Dynamically imports the CLI entry file
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

try {
  // Ensure Electron behaves like Node for the child process
  if (process.env.ELECTRON_RUN_AS_NODE !== '1') {
    process.env.ELECTRON_RUN_AS_NODE = '1';
  }

  // Avoid Gemini CLI relaunch loops that can perturb argv
  if (!process.env.GEMINI_CLI_NO_RELAUNCH) {
    process.env.GEMINI_CLI_NO_RELAUNCH = '1';
  }

  // Expect: [electronPath, shimPath, scriptPath, ...args]
  const originalArgv = [...process.argv];
  const argv = process.argv.slice(2);
  
  if (argv.length === 0) {
    console.error('[gemini-electron-shim] Missing CLI entry path. Usage: shim <path-to-gemini-cli/index.js> ...args');
    process.exit(2);
  }

  const scriptPath = argv[0];
  const scriptArgs = argv.slice(1);

  // Debug: log original argv
  if (process.env.DEBUG_SHIM) {
    console.error('[gemini-electron-shim] Original argv:', JSON.stringify(originalArgv));
  }
  
  // Normalize argv BEFORE importing so yargs.hideBin() removes only [0]=execPath, [1]=scriptPath
  // This is critical - the ESM module's top-level code runs immediately on import
  process.argv = [process.execPath, scriptPath, ...scriptArgs];
  
  // Debug: log normalized argv
  if (process.env.DEBUG_SHIM) {
    console.error('[gemini-electron-shim] Normalized argv:', JSON.stringify(process.argv));
    console.error('[gemini-electron-shim] Script path:', scriptPath);
    console.error('[gemini-electron-shim] Script args:', scriptArgs);
  }

  // (Optional) Consistent cwd when users run from GUI (no shell)
  // You can toggle this behavior by setting PDF_FILLER_CHDIR_TO_HOME=1
  if (process.env.PDF_FILLER_CHDIR_TO_HOME === '1') {
    try { process.chdir(os.homedir()); } catch {}
  }

  // Now import the CLI - argv is already normalized for yargs
  await import(scriptPath);
  
} catch (err) {
  console.error('[gemini-electron-shim] Failed to launch Gemini CLI:', err && err.stack ? err.stack : err);
  process.exit(1);
}