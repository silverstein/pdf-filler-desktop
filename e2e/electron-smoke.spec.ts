import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Electron app launches and shows main window', async () => {
  const entry = path.join(process.cwd(), 'dist', 'electron.js');

  // Launch Electron with the compiled entry
  const app = await electron.launch({
    args: [entry],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    }
  });

  try {
    // Wait for first window (server boots first, then window loads URL)
    const window = await app.waitForEvent('window', { timeout: 30000 });
    await window.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // Stable checks: title and presence of core header and status element
    const title = await window.title();
    expect(title).toContain('PDF Filler');

    // Header should exist
    await window.waitForSelector('header.header', { state: 'visible', timeout: 30000 });
    // Status text element should exist (text value may change later)
    await window.waitForSelector('#geminiStatusText', { state: 'attached', timeout: 30000 });
    // Main app container exists (may be hidden initially)
    await window.waitForSelector('#mainApp', { state: 'attached', timeout: 30000 });
  } finally {
    await app.close();
  }
});
