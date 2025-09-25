import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for the API exposed to the renderer
interface ElectronAPI {
  // Auth methods
  checkAuthStatus: () => Promise<any>;
  startGoogleAuth: () => Promise<any>;
  clearAuth: () => Promise<any>;
  
  // Codex (ChatGPT) methods
  ensureCodexInstalled: () => Promise<{ installed: boolean; path?: string }>;
  checkCodexAuth: () => Promise<{ installed: boolean; authenticated: boolean; detail?: string; error?: string }>;
  startChatGPTAuth: () => Promise<{ success: boolean; error?: string }>;
  
  // Claude methods
  checkClaudeAuth: () => Promise<{ installed: boolean; authenticated: boolean; detail?: string; error?: string }>;
  startClaudeAuth: () => Promise<{ success: boolean; error?: string }>;
  
  checkAnyAuth: () => Promise<{ authenticated: boolean; providers: { gemini: boolean; codex: boolean; claude: boolean }; email?: string; detail?: string; error?: string }>;
  getRateLimits: () => Promise<any>;
  
  // File methods
  selectPDF: () => Promise<string | null>;
  savePDF: (defaultName?: string) => Promise<string | null>;
  
  // Recent files methods
  getRecentFiles: () => Promise<string[]>;
  clearRecentFiles: () => Promise<void>;
  removeRecentFile: (filePath: string) => Promise<void>;
  
  // Event listeners
  onAuthUrlOpened: (callback: (url: string) => void) => void;
  onAuthSuccess: (callback: () => void) => void;
  onAuthFailure: (callback: (error: string) => void) => void;
  onRecentFilesUpdated: (callback: (files: string[]) => void) => void;
  onProcessPDF: (callback: (filePath: string) => void) => void;
  onOpenBatchMode: (callback: () => void) => void;
  onOpenSettings: (callback: () => void) => void;
  onUpdateStatus: (callback: (updateInfo: any) => void) => void;
  
  // App info
  getAppInfo: () => Promise<any>;  
  getUserEmail: () => Promise<string | null>;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth methods
  checkAuthStatus: () => ipcRenderer.invoke('check-auth-status'),
  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
  clearAuth: () => ipcRenderer.invoke('clear-auth'),
  
  // Codex methods
  ensureCodexInstalled: () => ipcRenderer.invoke('ensure-codex-installed'),
  checkCodexAuth: () => ipcRenderer.invoke('check-codex-auth'),
  startChatGPTAuth: () => ipcRenderer.invoke('start-codex-auth'),
  
  // Claude methods
  checkClaudeAuth: () => ipcRenderer.invoke('check-claude-auth'),
  startClaudeAuth: () => ipcRenderer.invoke('start-claude-auth'),
  
  checkAnyAuth: () => ipcRenderer.invoke('check-any-auth'),
  getRateLimits: () => ipcRenderer.invoke('get-rate-limits'),
  
  // File methods
  selectPDF: () => ipcRenderer.invoke('select-pdf'),
  savePDF: (defaultName?: string) => ipcRenderer.invoke('save-pdf', defaultName),
  
  // Recent files methods
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),
  removeRecentFile: (filePath: string) => ipcRenderer.invoke('remove-recent-file', filePath),
  
  // Listen for auth events
  onAuthUrlOpened: (callback: (url: string) => void) => {
    ipcRenderer.on('auth-url-opened', (event: IpcRendererEvent, url: string) => callback(url));
  },
  onAuthSuccess: (callback: () => void) => {
    ipcRenderer.on('auth-success', callback);
  },
  onAuthFailure: (callback: (error: string) => void) => {
    ipcRenderer.on('auth-failure', (event: IpcRendererEvent, error: string) => callback(error));
  },
  
  // Listen for recent files updates
  onRecentFilesUpdated: (callback: (files: string[]) => void) => {
    ipcRenderer.on('recent-files-updated', (event: IpcRendererEvent, files: string[]) => callback(files));
  },
  
  // Other events
  onProcessPDF: (callback: (filePath: string) => void) => {
    ipcRenderer.on('process-pdf', (event: IpcRendererEvent, filePath: string) => callback(filePath));
  },
  onOpenBatchMode: (callback: () => void) => {
    ipcRenderer.on('open-batch-mode', callback);
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', callback);
  },
  
  // Update events
  onUpdateStatus: (callback: (updateInfo: any) => void) => {
    ipcRenderer.on('update-status', (event: IpcRendererEvent, updateInfo: any) => callback(updateInfo));
  },
  
  // App info  
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getUserEmail: () => ipcRenderer.invoke('get-user-email')
} as ElectronAPI);

// Add type declaration for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};