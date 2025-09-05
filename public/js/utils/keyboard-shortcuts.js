/**
 * Keyboard Shortcuts Module for PDF Filler
 * This module ADDS keyboard functionality without removing anything from app.js
 * All existing functions remain in app.js and are called via window object
 */

(function() {
    'use strict';
    
    // Create namespace if it doesn't exist
    window.PDFApp = window.PDFApp || {};
    
    // Define all keyboard shortcuts in one place
    const shortcuts = {
        'cmd+t': { 
            action: 'cycleTheme', 
            description: 'Cycle through themes',
            requiresAuth: true 
        },
        'cmd+o': { 
            action: 'openFile', 
            description: 'Open file picker',
            requiresAuth: true 
        },
        'cmd+,': { 
            action: 'openSettings', 
            description: 'Open settings',
            requiresAuth: true 
        },
        'cmd+/': { 
            action: 'showHelp', 
            description: 'Show keyboard shortcuts',
            requiresAuth: false 
        },
        'cmd+?': { 
            action: 'showHelp', 
            description: 'Show keyboard shortcuts',
            requiresAuth: false 
        },
        'cmd+b': { 
            action: 'toggleSidebar', 
            description: 'Toggle sidebar',
            requiresAuth: true 
        },
        'cmd+shift+b': { 
            action: 'resetSidebar', 
            description: 'Reset sidebar state',
            requiresAuth: true 
        },
        'cmd+d': { 
            action: 'clearCurrentFile', 
            description: 'Clear current file',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+k': { 
            action: 'clearRecentFiles', 
            description: 'Clear recent files history',
            requiresAuth: true,
            confirm: 'Clear all recent files history?' 
        },
        'cmd+r': { 
            action: 'refreshIntelligence', 
            description: 'Refresh document intelligence',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+1': { 
            action: 'quickAction2', 
            description: 'Extract Data',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+2': { 
            action: 'quickAction3', 
            description: 'Fill Form',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+3': { 
            action: 'quickAction4', 
            description: 'Bulk Fill',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+4': { 
            action: 'quickAction5', 
            description: 'Validate',
            requiresAuth: true,
            requiresFile: true 
        },
        'cmd+5': { 
            action: 'quickAction6', 
            description: 'Profiles',
            requiresAuth: true,
            requiresFile: true 
        },
        'escape': { 
            action: 'closeModal', 
            description: 'Close current modal/dialog',
            requiresAuth: false 
        }
    };
    
    // Get key combination from event
    function getKeyCombo(e) {
        const parts = [];
        if (e.metaKey || e.ctrlKey) parts.push('cmd');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        
        // Normalize key names
        let key = e.key.toLowerCase();
        if (key === 'escape') key = 'escape';
        else if (key === ',') key = ',';
        else if (key === '/') key = '/';
        else if (key === '?') key = '?';
        
        parts.push(key);
        return parts.join('+');
    }
    
    // Check if user is authenticated (using existing app state)
    function isAuthenticated() {
        // Check if the main app div is visible (indicates authentication)
        const mainApp = document.getElementById('mainApp');
        return mainApp && mainApp.style.display !== 'none';
    }
    
    // Check if a file is selected
    function hasSelectedFile() {
        // Check if the drop zone has a file selected (by looking for the change file button)
        const changeFileBtn = document.querySelector('.change-file-btn');
        return changeFileBtn !== null;
    }
    
    // Execute keyboard shortcut action
    function executeAction(shortcut) {
        // Check requirements
        if (shortcut.requiresAuth && !isAuthenticated()) {
            return;
        }
        
        if (shortcut.requiresFile && !hasSelectedFile()) {
            return;
        }
        
        if (shortcut.confirm && !confirm(shortcut.confirm)) {
            return;
        }
        
        // Execute the action
        switch (shortcut.action) {
            case 'cycleTheme':
                if (window.cycleTheme) {
                    window.cycleTheme();
                }
                break;
                
            case 'openFile':
                const fileInput = document.getElementById('fileInput');
                if (fileInput) {
                    fileInput.click();
                }
                break;
                
            case 'openSettings':
                if (window.toggleSettings) {
                    const settingsView = document.getElementById('settingsView');
                    if (settingsView && settingsView.style.display !== 'block') {
                        window.toggleSettings();
                    }
                }
                break;
                
            case 'showHelp':
                if (window.showKeyboardShortcuts) {
                    window.showKeyboardShortcuts();
                }
                break;
                
            case 'toggleSidebar':
                if (window.toggleSidebar) {
                    window.toggleSidebar();
                }
                break;
                
            case 'resetSidebar':
                // Reset sidebar state completely
                localStorage.removeItem('sidebarOpen');
                window.location.reload();
                break;
                
            case 'clearCurrentFile':
                if (window.resetUpload) {
                    window.resetUpload();
                }
                break;
                
            case 'clearRecentFiles':
                if (window.clearRecentFiles) {
                    window.clearRecentFiles();
                }
                break;
                
            case 'refreshIntelligence':
                if (window.refreshIntelligence) {
                    window.refreshIntelligence();
                }
                break;
                
            case 'quickAction2':
                if (window.processFile) {
                    window.processFile('extract');
                }
                break;
                
            case 'quickAction3':
                if (window.openFormFillModal) {
                    window.openFormFillModal();
                }
                break;
                
            case 'quickAction4':
                if (window.openBulkFillModal) {
                    window.openBulkFillModal();
                }
                break;
                
            case 'quickAction5':
                if (window.processFile) {
                    window.processFile('validate');
                }
                break;
                
            case 'quickAction6':
                if (window.openProfileModal) {
                    window.openProfileModal();
                }
                break;
                
            case 'closeModal':
                // Try to close any open modal
                const modals = [
                    'formFillModal', 'bulkFillModal', 'profileModal', 
                    'saveProfileModal', 'createProfileModal'
                ];
                
                for (const modalId of modals) {
                    const modal = document.getElementById(modalId);
                    if (modal && modal.classList.contains('show')) {
                        // Find the corresponding close function
                        const closeFn = window[`close${modalId.charAt(0).toUpperCase()}${modalId.slice(1)}`];
                        if (closeFn) {
                            closeFn();
                            return;
                        }
                    }
                }
                
                // Check settings view
                const settingsView = document.getElementById('settingsView');
                if (settingsView && settingsView.style.display === 'block' && window.toggleSettings) {
                    window.toggleSettings();
                }
                break;
        }
    }
    
    // Keyboard event handler
    function handleKeydown(e) {
        const combo = getKeyCombo(e);
        const shortcut = shortcuts[combo];
        
        if (shortcut) {
            // Prevent default for our shortcuts
            e.preventDefault();
            e.stopPropagation();
            executeAction(shortcut);
        }
    }
    
    // Add missing global functions that app.js expects
    
    // Show keyboard shortcuts help modal
    window.showKeyboardShortcuts = function() {
        // Remove any existing help modal
        const existingModal = document.getElementById('keyboardShortcutsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay" id="keyboardShortcutsModal" style="display: flex;">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i data-lucide="keyboard" style="width: 20px; height: 20px;"></i>
                            Keyboard Shortcuts
                        </h3>
                        <button class="modal-close" onclick="document.getElementById('keyboardShortcutsModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
                        <div style="display: grid; gap: 0.75rem;">
                            ${Object.entries(shortcuts).map(([key, shortcut]) => {
                                const displayKey = key
                                    .replace('cmd+', '⌘')
                                    .replace('shift+', '⇧')
                                    .replace('alt+', '⌥')
                                    .replace('escape', 'ESC')
                                    .toUpperCase();
                                
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface-hover); border-radius: 4px;">
                                        <span style="font-family: monospace; background: var(--surface); padding: 0.25rem 0.5rem; border-radius: 3px; border: 1px solid var(--border);">
                                            ${displayKey}
                                        </span>
                                        <span style="margin-left: 1rem; opacity: 0.8;">
                                            ${shortcut.description}
                                        </span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-primary" onclick="document.getElementById('keyboardShortcutsModal').remove()">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };
    
    // Clear recent files function (if not already defined)
    if (!window.clearRecentFiles) {
        window.clearRecentFiles = async function() {
            // Clear from localStorage
            localStorage.removeItem('recentFiles');
            
            // Clear from Electron if available
            if (window.electronAPI && window.electronAPI.clearRecentFiles) {
                await window.electronAPI.clearRecentFiles();
            }
            
            // Update UI
            const recentFilesList = document.getElementById('recentFilesList');
            if (recentFilesList) {
                recentFilesList.innerHTML = `
                    <div class="no-recent-files">
                        <i data-lucide="file-text" style="width: 32px; height: 32px; opacity: 0.3;"></i>
                        <p>No recent files</p>
                        <small>Upload a PDF to get started</small>
                    </div>
                `;
                
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
        };
    }
    
    // Initialize module
    window.PDFApp.KeyboardShortcuts = {
        shortcuts: shortcuts,
        init: function() {
            // Add our keyboard handler
            document.addEventListener('keydown', handleKeydown);
            console.log('Keyboard shortcuts initialized');
        },
        show: function() {
            window.showKeyboardShortcuts();
        }
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.PDFApp.KeyboardShortcuts.init();
        });
    } else {
        // DOM is already loaded
        window.PDFApp.KeyboardShortcuts.init();
    }
    
})();