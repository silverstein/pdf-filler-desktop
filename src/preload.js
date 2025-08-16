const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth methods
  checkAuthStatus: () => ipcRenderer.invoke('check-auth-status'),
  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
  clearAuth: () => ipcRenderer.invoke('clear-auth'),
  getRateLimits: () => ipcRenderer.invoke('get-rate-limits'),
  
  // File methods (NEW)
  selectPDF: () => ipcRenderer.invoke('select-pdf'),
  savePDF: (defaultName) => ipcRenderer.invoke('save-pdf', defaultName),
  
  // Recent files methods (NEW)
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),
  removeRecentFile: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  
  // Listen for auth events
  onAuthUrlOpened: (callback) => {
    ipcRenderer.on('auth-url-opened', (event, url) => callback(url));
  },
  onAuthSuccess: (callback) => {
    ipcRenderer.on('auth-success', callback);
  },
  onAuthFailure: (callback) => {
    ipcRenderer.on('auth-failure', (event, error) => callback(error));
  },
  
  // Listen for recent files updates (NEW)
  onRecentFilesUpdated: (callback) => {
    ipcRenderer.on('recent-files-updated', (event, files) => callback(files));
  },
  
  // Other events
  onProcessPDF: (callback) => {
    ipcRenderer.on('process-pdf', (event, filePath) => callback(filePath));
  },
  onOpenBatchMode: (callback) => {
    ipcRenderer.on('open-batch-mode', callback);
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', callback);
  }
});