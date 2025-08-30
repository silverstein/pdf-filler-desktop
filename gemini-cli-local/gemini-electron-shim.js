#!/usr/bin/env node
/**
 * Gemini CLI shim for Electron (ELECTRON_RUN_AS_NODE)
 * 
 * 🚨 CRITICAL: DO NOT DELETE OR MODIFY WITHOUT UNDERSTANDING!
 * This shim is the ONLY reason the app works without requiring Node.js installation.
 *
 * Problem:
 * - yargs/helpers.hideBin() in Gemini CLI behaves differently with ELECTRON_RUN_AS_NODE
 * - In Electron context, hideBin() only removes argv[0] instead of argv[0] and argv[1]
 * - This causes Gemini CLI to see its own script path as an "Unknown argument"
 * - Hours of debugging with GPT-5 Pro were needed to figure this out!
 *
 * Solution:
 * - When running in Electron: Set argv to [execPath, ...args] (omit script path)
 * - When running in pure Node: Use standard [execPath, scriptPath, ...args]
 * - This ensures hideBin() always produces the correct result
 * 
 * Usage:
 *   electron (with ELECTRON_RUN_AS_NODE=1) <this-shim> <path-to-gemini-cli/index.js> ...args
 *
 * DO NOT:
 * - Try to call Gemini CLI directly without this shim
 * - Change the argv normalization logic
 * - Assume yargs will "just work" with Electron
 */

const os = require('os');

try {
  // Always ensure Node mode for Electron child
  process.env.ELECTRON_RUN_AS_NODE = '1';
  // Avoid CLI relaunches that can perturb argv/order
  process.env.GEMINI_CLI_NO_RELAUNCH = '1';

  // Expect: [electronAppPath, shimPath, cliEntryPath, ...args]
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('[gemini-electron-shim] Missing CLI entry path. Usage: shim <path-to-gemini-cli/index.js> ...args');
    process.exit(2);
  }

  const scriptPath = argv[0];
  const scriptArgs = argv.slice(1);

  const isElectron = !!(process.versions && process.versions.electron);
  
  // When running with ELECTRON_RUN_AS_NODE, yargs always treats it as bundled mode
  // and only slices 1 element, regardless of dev vs packaged status
  // So we always use bundled mode format when in Electron
  if (isElectron) {
    // hideBin will slice(1) in Electron mode, so exclude scriptPath from argv[1]
    process.argv = [process.execPath, ...scriptArgs];
  } else {
    // Pure Node: hideBin slices(2), keep the classic shape with scriptPath in argv[1]
    process.argv = [process.execPath, scriptPath, ...scriptArgs];
  }

  if (process.env.DEBUG_GEMINI_SHIM === '1') {
    console.error('[gemini-electron-shim] execPath:', process.execPath);
    console.error('[gemini-electron-shim] isElectron:', isElectron);
    console.error('[gemini-electron-shim] final argv:', JSON.stringify(process.argv));
  }

  // Optional: keep a predictable working directory when launched from GUI
  if (process.env.PDF_FILLER_CHDIR_TO_HOME === '1') {
    try { process.chdir(os.homedir()); } catch {}
  }

  // Since Gemini CLI is ESM, we need to use dynamic import
  import(scriptPath).catch(err => {
    console.error('[gemini-electron-shim] Failed to import Gemini CLI:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
} catch (err) {
  console.error('[gemini-electron-shim] Failed to launch Gemini CLI:', err && err.stack ? err.stack : err);
  process.exit(1);
}