import { autoUpdater } from 'electron-updater';
import { app, dialog, BrowserWindow } from 'electron';
import log from 'electron-log';

// Configure logging for auto-updater
log.transports.file.level = 'info';
autoUpdater.logger = log;

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private updateAvailable = false;
  private updateDownloaded = false;

  constructor() {
    this.setupEventHandlers();
    
    // Disable auto-download to give user control
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  public setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  private setupEventHandlers() {
    // Checking for update
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.sendStatusToWindow('checking-for-update');
    });

    // Update available
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.updateAvailable = true;
      this.sendStatusToWindow('update-available', info);
      
      // Show dialog to user
      const response = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Update Available',
        message: `A new version ${info.version} is available. Current version is ${app.getVersion()}.`,
        detail: 'Would you like to download it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendStatusToWindow('update-not-available');
    });

    // Error during update check
    autoUpdater.on('error', (err) => {
      log.error('Error in auto-updater:', err);
      this.sendStatusToWindow('update-error', err.message);
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
      logMessage = logMessage + ` - Downloaded ${progressObj.percent}%`;
      logMessage = logMessage + ` (${progressObj.transferred}/${progressObj.total})`;
      log.info(logMessage);
      
      this.sendStatusToWindow('download-progress', progressObj);
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.updateDownloaded = true;
      this.sendStatusToWindow('update-downloaded', info);
      
      // Show dialog to user
      const response = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded',
        detail: `Version ${info.version} has been downloaded and will be installed on restart. Would you like to restart now?`,
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }

  private sendStatusToWindow(status: string, data?: any) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('update-status', { status, data });
    }
  }

  public async checkForUpdates() {
    try {
      log.info('Manual update check initiated');
      const result = await autoUpdater.checkForUpdatesAndNotify();
      return result;
    } catch (error) {
      log.error('Error checking for updates:', error);
      
      // Show error to user only if manually checking
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Unable to check for updates',
        detail: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      
      throw error;
    }
  }

  public async checkForUpdatesAtStartup() {
    try {
      // Silent check at startup - don't show errors
      log.info('Startup update check initiated');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Error checking for updates at startup:', error);
      // Don't show error dialog at startup
    }
  }

  public isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }

  public isUpdateDownloaded(): boolean {
    return this.updateDownloaded;
  }

  public quitAndInstall() {
    autoUpdater.quitAndInstall();
  }
}

// Export singleton instance
export const updater = new AutoUpdater();