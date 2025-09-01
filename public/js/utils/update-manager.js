// Auto-update manager for handling app updates

class UpdateManager {
    constructor() {
        this.isListening = false;
    }

    // Initialize update manager
    async initialize() {
        await this.displayVersion();
        this.listenForUpdates();
    }

    // Display app version in the UI
    async displayVersion() {
        if (!window.electronAPI || !window.electronAPI.getAppInfo) {
            return;
        }

        try {
            const appInfo = await window.electronAPI.getAppInfo();
            const versionElement = document.getElementById('appVersion');
            if (versionElement && appInfo.version) {
                versionElement.textContent = `v${appInfo.version}`;
            }
        } catch (error) {
            console.error('Error getting app version:', error);
        }
    }

    // Listen for update events from the main process
    listenForUpdates() {
        if (!window.electronAPI || !window.electronAPI.onUpdateStatus || this.isListening) {
            return;
        }

        this.isListening = true;
        
        window.electronAPI.onUpdateStatus((updateInfo) => {
            const { status, data } = updateInfo;
            
            switch (status) {
                case 'checking-for-update':
                    console.log('Checking for updates...');
                    break;
                    
                case 'update-available':
                    console.log('Update available:', data);
                    // The dialog is shown by the main process
                    break;
                    
                case 'update-not-available':
                    console.log('App is up to date');
                    break;
                    
                case 'download-progress':
                    console.log(`Download progress: ${data.percent}%`);
                    this.showUpdateProgress(data);
                    break;
                    
                case 'update-downloaded':
                    console.log('Update downloaded, ready to install');
                    // The dialog is shown by the main process
                    break;
                    
                case 'update-error':
                    console.error('Update error:', data);
                    break;
            }
        });
    }

    // Show update download progress notification
    showUpdateProgress(progressData) {
        // Remove any existing progress notification
        let progressNotif = document.querySelector('.update-progress-notification');
        if (!progressNotif) {
            progressNotif = document.createElement('div');
            progressNotif.className = 'update-progress-notification';
            document.body.appendChild(progressNotif);
        }
        
        progressNotif.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="download" style="width: 16px; height: 16px;"></i>
                <span>Downloading update: ${Math.round(progressData.percent)}%</span>
            </div>
            <div style="width: 200px; height: 4px; background: var(--border); border-radius: 2px; margin-top: 8px;">
                <div style="width: ${progressData.percent}%; height: 100%; background: var(--primary); border-radius: 2px; transition: width 0.3s;"></div>
            </div>
        `;
        
        // Refresh Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        // Remove notification when download completes
        if (progressData.percent >= 100) {
            setTimeout(() => {
                progressNotif.remove();
            }, 2000);
        }
    }
}

// Export for use in other modules
window.UpdateManager = UpdateManager;