document.addEventListener('DOMContentLoaded', () => {
    let selectedFile = null;
    let selectedFileIsPath = false; // Track if selectedFile is a path or File object
    let currentResult = null;
    let isAuthenticated = false;
    let currentTheme = localStorage.getItem('selectedTheme') || 'mono';
    let currentFormFields = null;
    let currentModalFile = null;

    // Toggle between main app and settings
    function toggleSettings() {
        const settingsView = document.getElementById('settingsView');
        const mainApp = document.getElementById('mainApp');
        const authSection = document.getElementById('authSection');
        
        if (settingsView.style.display === 'block') {
            // Go back to main app
            settingsView.style.display = 'none';
            if (isAuthenticated) {
                mainApp.style.display = 'block';
            } else {
                authSection.style.display = 'block';
            }
        } else {
            // Show settings
            settingsView.style.display = 'block';
            mainApp.style.display = 'none';
            authSection.style.display = 'none';
            updateThemeCards();
        }
        
        // Refresh icons
        setTimeout(() => lucide.createIcons(), 10);
    }

    // Update active theme card
    function updateThemeCards() {
        document.querySelectorAll('.theme-card').forEach(card => {
            if (card.dataset.theme === currentTheme) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    // Select theme from settings
    function selectTheme(themeName) {
        applyTheme(themeName);
        updateThemeCards();
        lucide.createIcons();
    }

    // Apply saved theme on load
    function applyTheme(themeName) {
        document.body.className = `theme-${themeName}`;
        currentTheme = themeName;
        localStorage.setItem('selectedTheme', themeName);
        
        // Apply theme-specific styles dynamically
        updateThemeStyles(themeName);
    }
    
    // Cycle through available themes
    function cycleTheme() {
        const themes = ['mono', 'brutalist', 'glassmorphic', 'neubrutalism', 'gruvbox'];
        const currentIndex = themes.indexOf(currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        const nextTheme = themes[nextIndex];
        
        selectTheme(nextTheme);
        
        // Show a brief notification of theme change
        showThemeNotification(nextTheme);
    }
    
    // Show theme change notification
    function showThemeNotification(themeName) {
        const themeNames = {
            'mono': 'Mono',
            'brutalist': 'Brutalist Mono',
            'glassmorphic': 'Glassmorphic',
            'neubrutalism': 'Neubrutalism',
            'gruvbox': 'Gruvbox Light'
        };
        
        // Remove any existing notification
        const existingNotif = document.querySelector('.theme-notification');
        if (existingNotif) {
            existingNotif.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = 'theme-notification';
        notification.innerHTML = `
            <i data-lucide="palette" style="width: 16px; height: 16px;"></i>
            <span>Theme: ${themeNames[themeName] || themeName}</span>
        `;
        document.body.appendChild(notification);
        
        // Refresh icons in notification
        setTimeout(() => lucide.createIcons(), 10);
        
        // Remove after 2 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    function updateThemeStyles(themeName) {
        const header = document.querySelector('.header');
        const uploadArea = document.querySelector('.upload-area');
        const dropZone = document.querySelector('.drop-zone');
        const actionCards = document.querySelectorAll('.action-card');
        const authCard = document.querySelector('.auth-card');
        const statusIndicators = document.querySelectorAll('.status-indicator');
        const rateLimits = document.querySelector('.rate-limits');
        const results = document.querySelector('.results');
        const errorMessage = document.querySelector('.error-message');
        const statusDot = document.querySelector('.status-dot');
        const logoIcon = document.querySelector('.logo-icon');
        
        // Reset all custom styles
        const elements = [header, uploadArea, dropZone, authCard, rateLimits, results, errorMessage, logoIcon, ...actionCards, ...statusIndicators];
        elements.forEach(el => {
            if (el) el.style = '';
        });

        switch(themeName) {
            case 'brutalist':
                document.body.style.background = 'var(--bg)';
                if (header) {
                    header.style.borderBottom = '1px solid var(--border)';
                    header.style.background = 'var(--surface)';
                }
                if (uploadArea) {
                    uploadArea.style.background = 'var(--surface)';
                    uploadArea.style.border = '1px solid var(--border)';
                    uploadArea.style.borderRadius = '0';
                }
                if (dropZone) {
                    dropZone.style.border = '2px dashed var(--border)';
                    dropZone.style.borderRadius = '0';
                }
                actionCards.forEach(card => {
                    card.style.border = '1px solid var(--border)';
                    card.style.borderRadius = '0';
                    card.style.background = 'var(--surface)';
                });
                if (statusDot) statusDot.style.background = 'var(--success)';
                break;


            case 'glassmorphic':
                document.body.style.background = '#0A0E1A';
                if (header) {
                    header.style.background = 'rgba(17, 24, 39, 0.5)';
                    header.style.backdropFilter = 'blur(20px) saturate(180%)';
                    header.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                }
                if (uploadArea) {
                    uploadArea.style.background = 'rgba(255, 255, 255, 0.03)';
                    uploadArea.style.backdropFilter = 'blur(20px) saturate(180%)';
                    uploadArea.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                    uploadArea.style.borderRadius = '16px';
                    uploadArea.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.3)';
                }
                if (dropZone) {
                    dropZone.style.background = 'rgba(99, 102, 241, 0.05)';
                    dropZone.style.border = '2px dashed rgba(99, 102, 241, 0.3)';
                    dropZone.style.borderRadius = '12px';
                }
                if (logoIcon) {
                    logoIcon.style.background = 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)';
                    logoIcon.style.borderRadius = '8px';
                    logoIcon.style.color = 'white';
                }
                actionCards.forEach(card => {
                    card.style.background = 'rgba(255, 255, 255, 0.03)';
                    card.style.backdropFilter = 'blur(20px)';
                    card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                    card.style.borderRadius = '12px';
                });
                statusIndicators.forEach(ind => {
                    ind.style.background = 'rgba(255, 255, 255, 0.05)';
                    ind.style.backdropFilter = 'blur(10px)';
                    ind.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                    ind.style.borderRadius = '100px';
                });
                if (statusDot) {
                    statusDot.style.background = '#34D399';
                    statusDot.style.boxShadow = '0 0 8px rgba(52, 211, 153, 0.5)';
                }
                break;

            case 'neubrutalism':
                document.body.style.background = '#FFF8E7';
                if (header) {
                    header.style.background = 'white';
                    header.style.border = '4px solid #000';
                    header.style.boxShadow = '6px 6px 0 #000';
                    header.style.margin = '1rem';
                }
                if (uploadArea) {
                    uploadArea.style.background = 'white';
                    uploadArea.style.border = '4px solid #000';
                    uploadArea.style.borderRadius = '0';
                    uploadArea.style.boxShadow = '8px 8px 0 #000';
                }
                if (dropZone) {
                    dropZone.style.border = '4px dashed #000';
                    dropZone.style.borderRadius = '0';
                    dropZone.style.background = 'linear-gradient(45deg, #FFE5F1 25%, transparent 25%, transparent 75%, #FFE5F1 75%, #FFE5F1), linear-gradient(45deg, #FFE5F1 25%, transparent 25%, transparent 75%, #FFE5F1 75%, #FFE5F1)';
                    dropZone.style.backgroundSize = '20px 20px';
                    dropZone.style.backgroundPosition = '0 0, 10px 10px';
                }
                if (logoIcon) {
                    logoIcon.style.background = '#FF0080';
                    logoIcon.style.border = '3px solid #000';
                    logoIcon.style.borderRadius = '0';
                    logoIcon.style.color = 'white';
                    logoIcon.style.transform = 'rotate(-5deg)';
                    logoIcon.style.boxShadow = '3px 3px 0 #000';
                }
                actionCards.forEach((card, index) => {
                    const colors = ['#FFE5F1', '#E5F1FF', '#FFFBE5', '#E5FFE5'];
                    card.style.background = colors[index % 4];
                    card.style.border = '4px solid #000';
                    card.style.borderRadius = '0';
                    card.style.boxShadow = '5px 5px 0 #000';
                });
                statusIndicators.forEach(ind => {
                    ind.style.background = '#FFD700';
                    ind.style.border = '3px solid #000';
                    ind.style.borderRadius = '0';
                    ind.style.boxShadow = '3px 3px 0 #000';
                });
                if (statusDot) statusDot.style.background = '#00FF88';
                break;
                
            case 'gruvbox':
                document.body.style.background = 'var(--bg)';
                // Gruvbox theme uses CSS variables from themes.css
                // No need for manual style overrides
                if (statusDot) statusDot.style.background = 'var(--success)';
                break;
                
            case 'mono':
                document.body.style.background = 'var(--bg)';
                document.body.style.fontFamily = 'var(--font-family)';
                // Mono themes use CSS variables from themes.css
                if (statusDot) statusDot.style.background = 'var(--success)';
                break;
        }
    }

    // Initialize theme
    applyTheme(currentTheme);

    // Check authentication status on load
    async function checkAuthStatus() {
        if (window.electronAPI) {
            const authStatus = await window.electronAPI.checkAuthStatus();
            isAuthenticated = authStatus.authenticated;
            
            if (isAuthenticated) {
                // Get user email separately if not in authStatus
                let userEmail = authStatus.email;
                if (!userEmail || userEmail === 'undefined') {
                    try {
                        userEmail = await window.electronAPI.getUserEmail();
                    } catch {
                        userEmail = 'authenticated';
                    }
                }
                
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('mainApp').style.display = 'block';
                document.getElementById('geminiStatus').style.background = 'var(--success)';
                document.getElementById('geminiStatusText').textContent = userEmail || 'Connected';
                document.getElementById('accountEmail').innerHTML = `<i data-lucide="mail" style="width: 16px; height: 16px;"></i><span>${userEmail || 'Connected'}</span>`;
                lucide.createIcons();
            } else {
                document.getElementById('authSection').style.display = 'block';
                document.getElementById('mainApp').style.display = 'none';
            }
        } else {
            checkGeminiStatus();
        }
    }

    // Account dropdown functionality
    const accountTrigger = document.getElementById('accountTrigger');
    const accountMenu = document.getElementById('accountMenu');

    if (accountTrigger) {
        accountTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            accountMenu.classList.toggle('show');
        });
    }

    document.addEventListener('click', () => {
        if (accountMenu) {
            accountMenu.classList.remove('show');
        }
    });

    // Sign out function
    async function signOut() {
        if (window.electronAPI) {
            const confirmed = confirm('Are you sure you want to sign out? You will need to re-authenticate with Google to use the app again.');
            if (confirmed) {
                await window.electronAPI.clearAuth();
                // Reload the page to show auth screen
                window.location.reload();
            }
        }
    }

    // Switch account function
    async function switchAccount() {
        if (window.electronAPI) {
            const confirmed = confirm('This will sign you out and open the authentication flow for a new account. Continue?');
            if (confirmed) {
                await window.electronAPI.clearAuth();
                // Small delay before starting new auth
                setTimeout(async () => {
                    await window.electronAPI.startGoogleAuth();
                    // Reload to show auth screen
                    window.location.reload();
                }, 500);
            }
        }
    }

    // Handle Google Sign In
    async function handleGoogleSignIn() {
        if (window.electronAPI) {
            const signInBtn = document.getElementById('googleSignIn');
            signInBtn.disabled = true;
            signInBtn.textContent = 'Opening Terminal for authentication...';
            
            const result = await window.electronAPI.startGoogleAuth();
            
            if (result.success) {
                signInBtn.textContent = 'Complete sign-in in Terminal...';
                
                const authCheckInterval = setInterval(async () => {
                    const authStatus = await window.electronAPI.checkAuthStatus();
                    if (authStatus.authenticated) {
                        clearInterval(authCheckInterval);
                        signInBtn.textContent = 'Success! Redirecting...';
                        setTimeout(() => {
                            checkAuthStatus();
                        }, 1000);
                    }
                }, 3000);
                
                setTimeout(() => {
                    clearInterval(authCheckInterval);
                    signInBtn.disabled = false;
                    signInBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 48 48" style="margin-right: 8px;">
                            <!-- Google logo SVG paths -->
                        </svg>
                        Sign in with Google
                    `;
                }, 300000);
            } else {
                signInBtn.disabled = false;
                signInBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 48 48" style="margin-right: 8px;">
                        <!-- Google logo SVG paths -->
                    </svg>
                    Sign in with Google
                `;
                alert('Failed to start authentication: ' + result.error);
            }
        }
    }

    // Original checkGeminiStatus function as fallback
    async function checkGeminiStatus() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            const statusDot = document.getElementById('geminiStatus');
            const statusText = document.getElementById('geminiStatusText');
            
            if (data.geminiCLI === 'available') {
                statusDot.style.background = 'var(--success)';
                statusText.textContent = 'Gemini CLI Ready';
            } else {
                statusDot.style.background = 'var(--error)';
                statusText.textContent = 'Gemini CLI Not Found';
                showError('Please install Gemini CLI to use this application');
            }
        } catch (error) {
            console.error('Health check failed:', error);
        }
    }

    // File handling
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Use native file dialog if in Electron, otherwise fall back to web input
    dropZone.addEventListener('click', async () => {
        if (window.electronAPI) {
            const filePath = await window.electronAPI.selectPDF();
            if (filePath) {
                handleNativeFile(filePath);
            }
        } else {
            fileInput.click();
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent)';
        dropZone.style.background = 'var(--surface-hover)';
    });

    dropZone.addEventListener('dragleave', () => {
        updateThemeStyles(currentTheme);
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        updateThemeStyles(currentTheme);
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        selectedFile = file;
        selectedFileIsPath = false; // This is a File object, not a path
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.classList.add('collapsed');
        
        dropZone.innerHTML = `
            <div class="drop-zone-icon">
                <i data-lucide="file-check" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="file-info-compact">
                <strong title="${file.name}">${file.name}</strong><br>
                <small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>
            </div>
            <button class="change-file-btn" onclick="resetUpload()">Change File</button>
        `;
        lucide.createIcons();
        
        // Scroll to show actions
        setTimeout(() => {
            document.querySelector('.actions').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
    }
    
    // Handle native file selection (Electron)
    function handleNativeFile(filePath) {
        selectedFile = filePath;
        selectedFileIsPath = true; // Flag to know this is a path, not a File object
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.classList.add('collapsed');
        
        const fileName = filePath.split('/').pop();
        const fileInfo = `<small>${filePath}</small>`;
        
        dropZone.innerHTML = `
            <div class="drop-zone-icon">
                <i data-lucide="file-check" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="file-info-compact">
                <strong title="${fileName}">${fileName}</strong><br>
                <small title="${fileInfo}">${fileInfo}</small>
            </div>
            <button class="change-file-btn" onclick="resetUpload()">Change File</button>
        `;
        lucide.createIcons();
        
        // Fetch intelligence for the native file
        fetchIntelligence(filePath);
        
        // Scroll to show actions
        setTimeout(() => {
            document.querySelector('.actions').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
    }
    
    // Intelligence Functions
    async function fetchIntelligence(filePath) {
        const card = document.getElementById('intelligenceCard');
        const content = document.getElementById('intelligenceContent');
        
        // Show the card with loading state
        card.style.display = 'block';
        content.innerHTML = `
            <div class="intelligence-loading">
                <div class="spinner-small"></div>
                <span>Analyzing document with AI...</span>
            </div>
        `;
        
        try {
            const response = await fetch('/api/intelligence-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath })
            });
            
            if (response.ok) {
                const data = await response.json();
                displayIntelligence(data);
            } else {
                throw new Error('Failed to fetch intelligence');
            }
        } catch (error) {
            console.error('Intelligence error:', error);
            content.innerHTML = `
                <div style="color: var(--text-secondary); text-align: center;">
                    <p>Unable to analyze document at this time</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }
    
    function displayIntelligence(data) {
        const content = document.getElementById('intelligenceContent');
        const { summary, insights, metadata } = data;
        
        // Determine badge class based on importance
        const badgeClass = `badge-${summary.importance}`;
        
        content.innerHTML = `
            <div class="intelligence-summary">
                <h4>${summary.title}</h4>
                <p>${summary.description}</p>
                <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
                    <span style="font-size: 0.85rem; opacity: 0.7;">Priority:</span>
                    <span class="intelligence-badge ${badgeClass}">${summary.importance.toUpperCase()}</span>
                    <span style="font-size: 0.85rem; opacity: 0.7; margin-left: 1rem;">Type:</span>
                    <span class="intelligence-badge" style="background: var(--surface-hover); color: var(--text-secondary);">
                        ${summary.category.toUpperCase()}
                    </span>
                </div>
            </div>
            
            ${insights.completeness > 0 ? `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span>Document Completeness</span>
                    <strong>${insights.completeness}%</strong>
                </div>
                <div class="completeness-bar">
                    <div class="completeness-fill" style="width: ${insights.completeness}%"></div>
                </div>
            </div>
            ` : ''}
            
            <div class="intelligence-insights">
                ${insights.keyInsights && insights.keyInsights.length > 0 ? `
                <div class="insight-card">
                    <h5>Key Insights</h5>
                    <ul class="insight-list">
                        ${insights.keyInsights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${insights.nextActions && insights.nextActions.length > 0 ? `
                <div class="insight-card">
                    <h5>Recommended Actions</h5>
                    <ul class="insight-list">
                        ${insights.nextActions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                ${summary.processingTips && summary.processingTips.length > 0 ? `
                <div class="insight-card">
                    <h5>Processing Tips</h5>
                    <ul class="insight-list">
                        ${summary.processingTips.map(tip => `<li>${tip}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
            
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.85rem; color: var(--text-secondary);">
                <div style="display: flex; justify-content: space-between;">
                    <span>Analysis confidence: ${metadata.confidence}%</span>
                    <span>Processing time: ${(metadata.processingTime / 1000).toFixed(1)}s</span>
                </div>
            </div>
        `;
    }
    
    function refreshIntelligence() {
        if (selectedFile && selectedFileIsPath) {
            fetchIntelligence(selectedFile);
        }
    }
    
    window.resetUpload = function() {
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.classList.remove('collapsed');
        selectedFile = null;
        selectedFileIsPath = false;
        
        // Hide intelligence card
        document.getElementById('intelligenceCard').style.display = 'none';
        
        const dropZone = document.getElementById('dropZone');
        dropZone.classList.remove('compact');
        dropZone.innerHTML = `
            <div class="drop-zone-icon">
                <i data-lucide="upload" style="width: 48px; height: 48px;"></i>
            </div>
            <p>Drag & drop your PDF here</p>
            <small>or click to browse</small>
            <input type="file" id="fileInput" class="file-input" accept=".pdf">
        `;
        
        // Re-attach file input event
        const newFileInput = document.getElementById('fileInput');
        newFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });
        
        // Re-attach drop zone click handler
        dropZone.addEventListener('click', () => newFileInput.click());
        
        lucide.createIcons();
        hideResults();
    }

    // Action handlers
    document.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', async () => {
            if (!selectedFile) {
                showError('Please select a PDF file first');
                return;
            }
            
            const action = card.dataset.action;
            if (action === 'fill') {
                await openFormFillModal();
            } else if (action === 'bulk-fill') {
                await openBulkFillModal();
            } else if (action === 'profiles') {
                await openProfileModal();
            } else {
                await processFile(action);
            }
        });
    });

    async function processFile(action) {
        showProcessing();
        hideError();
        hideResults();
        
        console.log('Processing file:', { selectedFile, selectedFileIsPath, action });
        
        // Add to recent files if it's a path
        if (selectedFileIsPath && selectedFile) {
            addToRecentFiles(selectedFile);
        }
        
        // Check if we're using native file paths or web uploads
        let endpoint, body, headers;
        let formData = null; // Declare formData outside the if block
        
        if (window.electronAPI && selectedFileIsPath) {
            // Native file path mode
            endpoint = `/api/${action}-local`;
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({ filePath: selectedFile });
        } else {
            // Web upload mode
            endpoint = `/api/${action}`;
            formData = new FormData();
            formData.append('pdf', selectedFile);
            body = formData;
            headers = {}; // FormData sets its own headers
        }
        
        // Form filling is now handled by the modal - this shouldn't be reached
        if (action === 'fill') {
            throw new Error('Form filling should use the modal interface');
        }
        
        try {
            console.log('Sending request to:', endpoint, 'with headers:', headers);
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', response.status, errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            if (action === 'fill') {
                if (window.electronAPI && selectedFileIsPath) {
                    // Native mode - ask where to save
                    const saveResult = await window.electronAPI.savePDF('filled-form.pdf');
                    if (saveResult.success) {
                        // Update the request to save to the chosen path
                        const jsonBody = JSON.parse(body);
                        jsonBody.outputPath = saveResult.filePath;
                        
                        // Re-send the request with output path
                        const saveResponse = await fetch(endpoint, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify(jsonBody)
                        });
                        
                        const result = await saveResponse.json();
                        showResults({ message: `PDF filled and saved to: ${saveResult.filePath}` });
                    }
                } else {
                    // Web mode - download directly
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `filled-${selectedFile.name}`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    showResults({ message: 'PDF filled and downloaded!' });
                }
            } else {
                const data = await response.json();
                showResults(data);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            hideProcessing();
        }
    }

    let processingTimer;
    let processingStartTime;
    
    function showProcessing() {
        document.getElementById('processing').style.display = 'block';
        processingStartTime = Date.now();
        
        processingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - processingStartTime) / 1000);
            document.getElementById('processingTimer').textContent = `Processing time: ${elapsed} seconds`;
        }, 1000);
    }

    function hideProcessing() {
        document.getElementById('processing').style.display = 'none';
        if (processingTimer) {
            clearInterval(processingTimer);
            processingTimer = null;
        }
        document.getElementById('processingTimer').textContent = '';
    }

    function showResults(data) {
        currentResult = data;
        const resultsEl = document.getElementById('results');
        resultsEl.style.display = 'flex';
        resultsEl.classList.add('visible');
        const resultContent = document.getElementById('resultContent');
        resultContent.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre><span class="copy-tooltip">Click to copy</span>`;
        
        // Reset copy button state
        const copyBtn = document.getElementById('copyBtn');
        const copyText = document.getElementById('copyText');
        const copyIcon = document.getElementById('copyIcon');
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copy JSON';
        copyIcon.textContent = '📋';
        
        // Scroll to results
        setTimeout(() => {
            resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    async function copyToClipboard() {
        if (!currentResult) return;
        
        const jsonString = JSON.stringify(currentResult, null, 2);
        
        try {
            await navigator.clipboard.writeText(jsonString);
            
            // Update button state
            const copyBtn = document.getElementById('copyBtn');
            const copyText = document.getElementById('copyText');
            const copyIcon = document.getElementById('copyIcon');
            
            copyBtn.classList.add('copied');
            copyText.textContent = 'Copied!';
            copyIcon.setAttribute('data-lucide', 'check');
            lucide.createIcons();
            
            // Reset after 2 seconds
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyText.textContent = 'Copy JSON';
                copyIcon.setAttribute('data-lucide', 'clipboard');
                lucide.createIcons();
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = jsonString;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                
                // Update button state
                const copyBtn = document.getElementById('copyBtn');
                const copyText = document.getElementById('copyText');
                const copyIcon = document.getElementById('copyIcon');
                
                copyBtn.classList.add('copied');
                copyText.textContent = 'Copied!';
                copyIcon.textContent = '✅';
                
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyText.textContent = 'Copy JSON';
                    copyIcon.textContent = '📋';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
                showError('Failed to copy to clipboard');
            }
            
            document.body.removeChild(textArea);
        }
    }

    function hideResults() {
        const resultsEl = document.getElementById('results');
        resultsEl.style.display = 'none';
        resultsEl.classList.remove('visible');
    }

    function showError(message) {
        const errorEl = document.getElementById('errorMessage');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        errorEl.style.background = 'var(--error)';
        errorEl.style.color = 'white';
        errorEl.style.padding = '1rem';
        errorEl.style.borderRadius = '8px';
    }

    function hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    function downloadResult() {
        if (!currentResult) return;
        
        const blob = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'result.json';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Initialize
    checkAuthStatus();
    
    // Initialize update manager
    if (window.UpdateManager) {
        const updateManager = new window.UpdateManager();
        updateManager.initialize();
    }
    
    // Close modal when clicking outside
    document.getElementById('formFillModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeFormFillModal();
        }
    });
    
    document.getElementById('bulkFillModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeBulkFillModal();
        }
    });

    // Initialize Lucide icons multiple times to ensure they render
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });
    
    window.addEventListener('load', () => {
        lucide.createIcons();
    });
    
    // Try immediately as well
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // And after a short delay
    setTimeout(() => {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 500);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd+T (Mac) or Ctrl+T (Windows/Linux) to cycle through themes
        if ((e.metaKey || e.ctrlKey) && e.key === 't') {
            e.preventDefault();
            if (isAuthenticated) {
                cycleTheme();
            }
        }
        
        // Cmd+, (Mac) or Ctrl+, (Windows/Linux) for settings
        if ((e.metaKey || e.ctrlKey) && e.key === ',') {
            e.preventDefault();
            const settingsView = document.getElementById('settingsView');
            const mainApp = document.getElementById('mainApp');
            
            // Only open settings if authenticated and not already in settings
            if (isAuthenticated && settingsView.style.display !== 'block') {
                toggleSettings();
            }
        }
        
        // Cmd+Shift+? or Cmd+/ to show keyboard shortcuts help
        if ((e.metaKey || e.ctrlKey) && (e.key === '?' || e.key === '/')) {
            e.preventDefault();
            showKeyboardShortcuts();
        }
        
        // Cmd+1 through Cmd+6 for quick actions
        if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '6') {
            e.preventDefault();
            if (isAuthenticated && selectedFile) {
                const actionMap = {
                    '1': 'analyze',
                    '2': 'extract',
                    '3': 'fill',
                    '4': 'bulk-fill',
                    '5': 'validate',
                    '6': 'profiles'
                };
                const action = actionMap[e.key];
                if (action === 'fill') {
                    openFormFillModal();
                } else if (action === 'bulk-fill') {
                    openBulkFillModal();
                } else if (action === 'profiles') {
                    openProfileModal();
                } else {
                    processFile(action);
                }
            }
        }
        
        // Cmd+R to refresh intelligence (when file is selected)
        if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
            if (isAuthenticated && selectedFile && selectedFileIsPath) {
                e.preventDefault();
                refreshIntelligence();
            }
        }
        
        // Cmd+D to clear/reset current file
        if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
            e.preventDefault();
            if (isAuthenticated && selectedFile) {
                resetUpload();
            }
        }
        
        // Cmd+K to clear recent files (with confirmation)
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            if (isAuthenticated && confirm('Clear all recent files history?')) {
                clearRecentFiles();
            }
        }
        
        
        // ESC to close modals and settings
        if (e.key === 'Escape') {
            const formModal = document.getElementById('formFillModal');
            const bulkModal = document.getElementById('bulkFillModal');
            const profileModal = document.getElementById('profileModal');
            const saveProfileModal = document.getElementById('saveProfileModal');
            const createProfileModal = document.getElementById('createProfileModal');
            const settingsView = document.getElementById('settingsView');
            
            if (formModal.classList.contains('show')) {
                e.preventDefault();
                closeFormFillModal();
            } else if (bulkModal.classList.contains('show')) {
                e.preventDefault();
                closeBulkFillModal();
            } else if (profileModal.classList.contains('show')) {
                e.preventDefault();
                closeProfileModal();
            } else if (saveProfileModal.classList.contains('show')) {
                e.preventDefault();
                closeSaveProfileModal();
            } else if (createProfileModal.classList.contains('show')) {
                e.preventDefault();
                closeCreateProfileModal();
            } else if (settingsView.style.display === 'block') {
                e.preventDefault();
                toggleSettings();
            }
        }
        
        // Cmd+O (Mac) or Ctrl+O (Windows/Linux) to open a file
        if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
            e.preventDefault();
            const fileInput = document.getElementById('fileInput');
            if (fileInput && isAuthenticated) {
                fileInput.click();
            }
        }
    });
    
    // Form Fill Modal Functions
    async function openFormFillModal() {
        if (!selectedFile) {
            showError('Please select a PDF file first');
            return;
        }

        currentModalFile = selectedFile;
        const modal = document.getElementById('formFillModal');
        const loading = document.getElementById('modalLoading');
        const fieldsContainer = document.getElementById('formFieldsContainer');
        const modalError = document.getElementById('modalError');
        const fillBtn = document.getElementById('fillFormBtn');

        // Reset modal state
        loading.style.display = 'block';
        fieldsContainer.style.display = 'none';
        modalError.style.display = 'none';
        document.getElementById('passwordSection').style.display = 'none';
        fillBtn.disabled = true;

        // Show modal
        modal.classList.add('show');
        lucide.createIcons();

        try {
            await loadFormFields();
        } catch (error) {
            console.error('Failed to load form fields:', error);
            showModalError(error.message);
        }
    }

    async function loadFormFields(password = null) {
        const loading = document.getElementById('modalLoading');
        const fieldsContainer = document.getElementById('formFieldsContainer');
        const modalError = document.getElementById('modalError');
        const fillBtn = document.getElementById('fillFormBtn');

        loading.style.display = 'block';
        modalError.style.display = 'none';

        try {
            let endpoint, body, headers;

            if (window.electronAPI && selectedFileIsPath) {
                // Native file path mode
                endpoint = '/api/read-fields-local';
                headers = { 'Content-Type': 'application/json' };
                body = JSON.stringify({ 
                    filePath: currentModalFile,
                    password: password 
                });
            } else {
                // Web upload mode
                endpoint = '/api/read-fields';
                const formData = new FormData();
                formData.append('pdf', currentModalFile);
                if (password) {
                    formData.append('password', password);
                }
                body = formData;
                headers = {};
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 404) {
                    throw new Error('Form field reading endpoint not available. Please ensure your server supports the /api/read-fields-local or /api/read-fields endpoints.');
                }
                throw new Error(`Failed to read form fields: ${errorText}`);
            }

            const data = await response.json();
            
            if (data.requiresPassword) {
                loading.style.display = 'none';
                document.getElementById('passwordSection').style.display = 'block';
                return;
            }

            currentFormFields = data.fields || [];
            renderFormFields(currentFormFields);
            
            loading.style.display = 'none';
            fieldsContainer.style.display = 'block';
            profileSection.style.display = 'block';
            fillBtn.disabled = false;
            
            // Refresh icons
            setTimeout(() => lucide.createIcons(), 100);

        } catch (error) {
            loading.style.display = 'none';
            showModalError(error.message);
        }
    }

    function renderFormFields(fields) {
        const container = document.getElementById('formFields');
        container.innerHTML = '';

        if (!fields || fields.length === 0) {
            container.innerHTML = '<p style="text-align: center; opacity: 0.7;">No form fields found in this PDF.</p>';
            return;
        }

        fields.forEach((field, index) => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'form-field';

            const label = document.createElement('label');
            label.htmlFor = `field_${index}`;
            label.innerHTML = `
                ${field.name || `Field ${index + 1}`}
                <span class="field-type">${field.type || 'text'}</span>
            `;

            let input;
            switch (field.type) {
                case 'checkbox':
                    const wrapper = document.createElement('div');
                    wrapper.className = 'checkbox-wrapper';
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = `field_${index}`;
                    input.checked = field.value === 'true' || field.value === true;
                    const checkboxLabel = document.createElement('label');
                    checkboxLabel.htmlFor = `field_${index}`;
                    checkboxLabel.textContent = field.name || `Field ${index + 1}`;
                    wrapper.appendChild(input);
                    wrapper.appendChild(checkboxLabel);
                    fieldDiv.innerHTML = '';
                    fieldDiv.appendChild(wrapper);
                    break;
                
                case 'select':
                case 'dropdown':
                    input = document.createElement('select');
                    input.id = `field_${index}`;
                    
                    // Add empty option
                    const emptyOption = document.createElement('option');
                    emptyOption.value = '';
                    emptyOption.textContent = 'Choose an option...';
                    input.appendChild(emptyOption);
                    
                    // Add field options if available
                    if (field.options && Array.isArray(field.options)) {
                        field.options.forEach(option => {
                            const optionEl = document.createElement('option');
                            optionEl.value = option;
                            optionEl.textContent = option;
                            optionEl.selected = option === field.value;
                            input.appendChild(optionEl);
                        });
                    }
                    break;
                
                case 'textarea':
                case 'multiline':
                    input = document.createElement('textarea');
                    input.id = `field_${index}`;
                    input.rows = 3;
                    input.value = field.value || '';
                    break;
                
                default:
                    input = document.createElement('input');
                    input.type = 'text';
                    input.id = `field_${index}`;
                    input.value = field.value || '';
                    input.placeholder = `Enter ${field.name || 'value'}`;
                    break;
            }

            if (field.type !== 'checkbox') {
                fieldDiv.appendChild(label);
                fieldDiv.appendChild(input);
            }
            
            container.appendChild(fieldDiv);
        });
    }

    async function fillAndSavePDF() {
        const fillBtn = document.getElementById('fillFormBtn');
        const modalError = document.getElementById('modalError');
        
        fillBtn.disabled = true;
        fillBtn.innerHTML = '<i data-lucide="loader-2" style="width: 16px; height: 16px; margin-right: 0.5rem; animation: spin 1s linear infinite;"></i>Filling PDF...';
        modalError.style.display = 'none';

        try {
            // Collect form data
            const fillData = {};
            currentFormFields.forEach((field, index) => {
                const input = document.getElementById(`field_${index}`);
                if (input) {
                    let value;
                    if (input.type === 'checkbox') {
                        value = input.checked;
                    } else {
                        value = input.value;
                    }
                    
                    // Only include non-empty values
                    if (value !== '' && value !== null && value !== undefined) {
                        fillData[field.name || `field_${index}`] = value;
                    }
                }
            });

            // Get password if provided
            const passwordInput = document.getElementById('pdfPassword');
            const password = passwordInput ? passwordInput.value : null;

            let endpoint, body, headers;
            
            if (window.electronAPI && selectedFileIsPath) {
                // Native mode - ask where to save first
                const saveResult = await window.electronAPI.savePDF('filled-form.pdf');
                if (!saveResult.success) {
                    throw new Error('Save cancelled');
                }

                endpoint = '/api/fill-pdf-local';
                headers = { 'Content-Type': 'application/json' };
                body = JSON.stringify({ 
                    filePath: currentModalFile,
                    fillData: fillData,
                    outputPath: saveResult.filePath,
                    password: password
                });
            } else {
                // Web mode
                endpoint = '/api/fill-pdf';
                const formData = new FormData();
                formData.append('pdf', currentModalFile);
                formData.append('data', JSON.stringify(fillData));
                if (password) {
                    formData.append('password', password);
                }
                body = formData;
                headers = {};
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 404) {
                    throw new Error('PDF filling endpoint not available. Please ensure your server supports the /api/fill-pdf-local or /api/fill-pdf endpoints.');
                }
                throw new Error(`Failed to fill PDF: ${errorText}`);
            }

            if (window.electronAPI && selectedFileIsPath) {
                // Native mode - show success message
                const result = await response.json();
                showResults({ message: `PDF filled and saved successfully!`, filePath: result.outputPath });
            } else {
                // Web mode - download the file
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `filled-${currentModalFile.name}`;
                a.click();
                window.URL.revokeObjectURL(url);
                showResults({ message: 'PDF filled and downloaded successfully!' });
            }

            closeFormFillModal();

        } catch (error) {
            showModalError(error.message);
            fillBtn.disabled = false;
            fillBtn.innerHTML = '<i data-lucide="download" style="width: 16px; height: 16px; margin-right: 0.5rem;"></i>Fill & Save PDF';
            lucide.createIcons();
        }
    }

    function closeFormFillModal() {
        const modal = document.getElementById('formFillModal');
        modal.classList.remove('show');
        currentFormFields = null;
        currentModalFile = null;
        
        // Reset form
        document.getElementById('formFields').innerHTML = '';
        const passwordInput = document.getElementById('pdfPassword');
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        // Reset button
        const fillBtn = document.getElementById('fillFormBtn');
        fillBtn.disabled = true;
        fillBtn.innerHTML = '<i data-lucide="download" style="width: 16px; height: 16px; margin-right: 0.5rem;"></i>Fill & Save PDF';
        
        // Refresh icons
        setTimeout(() => lucide.createIcons(), 100);
    }

    function showModalError(message) {
        const modalError = document.getElementById('modalError');
        modalError.textContent = message;
        modalError.style.display = 'block';
    }

    // Handle password submission
    function submitPassword() {
        const passwordInput = document.getElementById('pdfPassword');
        const password = passwordInput.value.trim();
        if (password) {
            loadFormFields(password);
        } else {
            showModalError('Please enter a password');
        }
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.target.id === 'pdfPassword') {
            e.preventDefault();
            submitPassword();
        }
    });

    // Listen for settings event from Electron tray
    if (window.electronAPI) {
        window.electronAPI.onOpenSettings(() => {
            if (isAuthenticated) {
                toggleSettings();
            }
        });
    }

    // Bulk Fill Modal Functions
    let bulkTemplatePath = null;
    let bulkCsvPath = null;
    let bulkOutputPath = null;
    let bulkProcessingResults = null;

    async function openBulkFillModal() {
        const modal = document.getElementById('bulkFillModal');
        const setupSection = document.getElementById('bulkSetupSection');
        const processingSection = document.getElementById('bulkProcessingSection');
        const modalError = document.getElementById('bulkModalError');
        const startBtn = document.getElementById('startBulkFillBtn');

        // Reset modal state
        setupSection.style.display = 'block';
        processingSection.style.display = 'none';
        modalError.style.display = 'none';
        document.getElementById('bulkPasswordSection').style.display = 'none';
        document.getElementById('downloadSummaryBtn').style.display = 'none';
        startBtn.disabled = true;
        
        // Reset file selections
        bulkTemplatePath = null;
        bulkCsvPath = null;
        bulkOutputPath = null;
        bulkProcessingResults = null;
        
        document.getElementById('templatePDF').value = '';
        document.getElementById('csvFile').value = '';
        document.getElementById('outputDirectory').value = '';
        document.getElementById('bulkPdfPassword').value = '';

        // Show modal
        modal.classList.add('show');
        lucide.createIcons();
    }

    async function selectTemplatePDF() {
        if (window.electronAPI) {
            const result = await window.electronAPI.selectPDF();
            if (result.success) {
                bulkTemplatePath = result.filePath;
                document.getElementById('templatePDF').value = result.filePath.split('/').pop();
                checkBulkFormReady();
            }
        } else {
            showBulkModalError('File selection is only available in the desktop app');
        }
    }

    async function selectCSVFile() {
        if (window.electronAPI) {
            const result = await window.electronAPI.selectFile([
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] }
            ]);
            if (result.success) {
                bulkCsvPath = result.filePath;
                document.getElementById('csvFile').value = result.filePath.split('/').pop();
                checkBulkFormReady();
            }
        } else {
            showBulkModalError('File selection is only available in the desktop app');
        }
    }

    async function selectOutputDirectory() {
        if (window.electronAPI) {
            const result = await window.electronAPI.selectDirectory();
            if (result.success) {
                bulkOutputPath = result.filePath;
                document.getElementById('outputDirectory').value = result.filePath;
                checkBulkFormReady();
            }
        } else {
            showBulkModalError('Directory selection is only available in the desktop app');
        }
    }

    function checkBulkFormReady() {
        const startBtn = document.getElementById('startBulkFillBtn');
        const namingPattern = document.getElementById('namingPattern').value.trim();
        
        if (bulkTemplatePath && bulkCsvPath && bulkOutputPath && namingPattern) {
            startBtn.disabled = false;
        } else {
            startBtn.disabled = true;
        }
    }

    // Add event listener for naming pattern input
    document.getElementById('namingPattern').addEventListener('input', checkBulkFormReady);

    async function startBulkFill() {
        const setupSection = document.getElementById('bulkSetupSection');
        const processingSection = document.getElementById('bulkProcessingSection');
        const modalError = document.getElementById('bulkModalError');
        const startBtn = document.getElementById('startBulkFillBtn');
        
        // Validate inputs
        if (!bulkTemplatePath || !bulkCsvPath || !bulkOutputPath) {
            showBulkModalError('Please select all required files and directories');
            return;
        }
        
        const namingPattern = document.getElementById('namingPattern').value.trim();
        if (!namingPattern) {
            showBulkModalError('Please enter a file naming pattern');
            return;
        }

        // Hide setup, show processing
        setupSection.style.display = 'none';
        processingSection.style.display = 'block';
        modalError.style.display = 'none';
        startBtn.disabled = true;
        
        // Reset progress
        updateBulkProgress(0, 0, 'Preparing to process files...');
        document.getElementById('bulkResultsSummary').style.display = 'none';
        document.getElementById('bulkErrorContainer').style.display = 'none';

        try {
            // Get password if provided
            const password = document.getElementById('bulkPdfPassword').value || null;

            const requestBody = {
                templatePath: bulkTemplatePath,
                csvPath: bulkCsvPath,
                outputPath: bulkOutputPath,
                namingPattern: namingPattern,
                password: password
            };

            const response = await fetch('/api/bulk-fill-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const update = JSON.parse(line);
                            handleBulkUpdate(update);
                        } catch (e) {
                            console.warn('Failed to parse update:', line);
                        }
                    }
                }
            }
            
            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const update = JSON.parse(buffer);
                    handleBulkUpdate(update);
                } catch (e) {
                    console.warn('Failed to parse final update:', buffer);
                }
            }

        } catch (error) {
            console.error('Bulk fill error:', error);
            setupSection.style.display = 'block';
            processingSection.style.display = 'none';
            showBulkModalError(error.message);
            startBtn.disabled = false;
        }
    }

    function handleBulkUpdate(update) {
        if (update.type === 'progress') {
            updateBulkProgress(update.completed, update.total, update.message);
        } else if (update.type === 'complete') {
            bulkProcessingResults = update.results;
            showBulkResults(update.results);
            document.getElementById('downloadSummaryBtn').style.display = 'block';
        } else if (update.type === 'error') {
            showBulkModalError(update.message);
        } else if (update.type === 'requiresPassword') {
            document.getElementById('bulkPasswordSection').style.display = 'block';
            document.getElementById('bulkSetupSection').style.display = 'block';
            document.getElementById('bulkProcessingSection').style.display = 'none';
            document.getElementById('startBulkFillBtn').disabled = false;
            showBulkModalError('This PDF requires a password. Please enter it and try again.');
        }
    }

    function updateBulkProgress(completed, total, message) {
        const progressFill = document.getElementById('bulkProgressFill');
        const progressText = document.getElementById('bulkProgressText');
        const progressCount = document.getElementById('bulkProgressCount');
        const progressPercent = document.getElementById('bulkProgressPercent');
        
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = message;
        progressCount.textContent = `${completed} / ${total}`;
        progressPercent.textContent = `${percentage}%`;
    }

    function showBulkResults(results) {
        const summaryContainer = document.getElementById('bulkResultsSummary');
        const errorContainer = document.getElementById('bulkErrorContainer');
        const errorList = document.getElementById('bulkErrorList');
        const successCount = document.getElementById('successCount');
        const failureCount = document.getElementById('failureCount');
        
        // Update summary stats
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        successCount.textContent = successful;
        failureCount.textContent = failed;
        summaryContainer.style.display = 'grid';
        
        // Show errors if any
        const errors = results.filter(r => !r.success);
        if (errors.length > 0) {
            errorContainer.style.display = 'block';
            errorList.innerHTML = '';
            
            errors.forEach(error => {
                const errorItem = document.createElement('div');
                errorItem.className = 'error-item';
                errorItem.innerHTML = `
                    <div class="error-row">Row ${error.row}</div>
                    <div class="error-message">${error.error}</div>
                `;
                errorList.appendChild(errorItem);
            });
        } else {
            errorContainer.style.display = 'none';
        }
        
        // Update final progress message
        updateBulkProgress(results.length, results.length, 
            `Complete! ${successful} successful, ${failed} failed`);
    }

    function downloadBulkSummary() {
        if (!bulkProcessingResults) return;
        
        const summary = {
            timestamp: new Date().toISOString(),
            template: bulkTemplatePath,
            csvFile: bulkCsvPath,
            outputDirectory: bulkOutputPath,
            totalRows: bulkProcessingResults.length,
            successful: bulkProcessingResults.filter(r => r.success).length,
            failed: bulkProcessingResults.filter(r => !r.success).length,
            results: bulkProcessingResults
        };
        
        const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk-fill-summary-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    function closeBulkFillModal() {
        const modal = document.getElementById('bulkFillModal');
        modal.classList.remove('show');
        
        // Reset state
        bulkTemplatePath = null;
        bulkCsvPath = null;
        bulkOutputPath = null;
        bulkProcessingResults = null;
        
        // Reset form
        document.getElementById('templatePDF').value = '';
        document.getElementById('csvFile').value = '';
        document.getElementById('outputDirectory').value = '';
        document.getElementById('bulkPdfPassword').value = '';
        document.getElementById('namingPattern').value = 'filled_{row}_{timestamp}';
        
        // Reset sections
        document.getElementById('bulkSetupSection').style.display = 'block';
        document.getElementById('bulkProcessingSection').style.display = 'none';
        document.getElementById('bulkPasswordSection').style.display = 'none';
        document.getElementById('bulkModalError').style.display = 'none';
        document.getElementById('downloadSummaryBtn').style.display = 'none';
        
        // Reset button
        const startBtn = document.getElementById('startBulkFillBtn');
        startBtn.disabled = true;
        startBtn.innerHTML = '<i data-lucide="play" style="width: 16px; height: 16px; margin-right: 0.5rem;"></i>Start Processing';
        
        // Refresh icons
        setTimeout(() => lucide.createIcons(), 100);
    }

    function showBulkModalError(message) {
        const modalError = document.getElementById('bulkModalError');
        modalError.textContent = message;
        modalError.style.display = 'block';
    }

    // Profile Management Functions
    let currentProfiles = [];
    let currentEditProfileId = null;

    async function openProfileModal() {
        const modal = document.getElementById('profileModal');
        modal.classList.add('show');
        await loadProfiles();
        lucide.createIcons();
    }

    function closeProfileModal() {
        const modal = document.getElementById('profileModal');
        modal.classList.remove('show');
    }

    async function loadProfiles() {
        const profileList = document.getElementById('profileList');
        
        try {
            const response = await fetch('/api/profiles');
            if (!response.ok) throw new Error('Failed to load profiles');
            
            currentProfiles = await response.json();
            renderProfileList();
        } catch (error) {
            console.error('Error loading profiles:', error);
            profileList.innerHTML = `
                <div class="empty-profiles">
                    <i data-lucide="alert-circle"></i>
                    <p>Error loading profiles</p>
                    <small>${error.message}</small>
                </div>
            `;
            lucide.createIcons();
        }
    }

    function renderProfileList() {
        const profileList = document.getElementById('profileList');
        
        if (currentProfiles.length === 0) {
            profileList.innerHTML = `
                <div class="empty-profiles">
                    <i data-lucide="user-plus"></i>
                    <p>No profiles saved yet</p>
                    <small>Create your first profile to save form data for reuse</small>
                </div>
            `;
        } else {
            profileList.innerHTML = currentProfiles.map(profile => `
                <div class="profile-item ${profile.isDefault ? 'default' : ''}">
                    <div class="profile-header">
                        <div class="profile-info">
                            <div class="profile-name">
                                ${escapeHtml(profile.name)}
                                ${profile.isDefault ? '<span class="default-badge">Default</span>' : ''}
                            </div>
                            ${profile.description ? `<div class="profile-description">${escapeHtml(profile.description)}</div>` : ''}
                            ${profile.tags && profile.tags.length > 0 ? `
                                <div class="profile-tags">
                                    ${profile.tags.map(tag => `<span class="profile-tag">${escapeHtml(tag)}</span>`).join('')}
                                </div>
                            ` : ''}
                            <div class="profile-meta">
                                <span><i data-lucide="calendar" style="width: 12px; height: 12px; margin-right: 0.25rem;"></i>${new Date(profile.createdAt).toLocaleDateString()}</span>
                                <span><i data-lucide="edit-3" style="width: 12px; height: 12px; margin-right: 0.25rem;"></i>${Object.keys(profile.data).length} fields</span>
                            </div>
                            <div class="profile-fields-preview">
                                ${Object.keys(profile.data).slice(0, 3).map(key => `${key}: ${escapeHtml(String(profile.data[key]).substring(0, 30))}${String(profile.data[key]).length > 30 ? '...' : ''}`).join(', ')}
                                ${Object.keys(profile.data).length > 3 ? `... and ${Object.keys(profile.data).length - 3} more` : ''}
                            </div>
                        </div>
                        <div class="profile-actions">
                            <button class="icon-btn" onclick="editProfile('${profile.id}')" title="Edit">
                                <i data-lucide="edit-2"></i>
                            </button>
                            <button class="icon-btn" onclick="toggleDefaultProfile('${profile.id}')" title="${profile.isDefault ? 'Remove default' : 'Set as default'}">
                                <i data-lucide="${profile.isDefault ? 'star' : 'star'}"></i>
                            </button>
                            <button class="icon-btn" onclick="deleteProfile('${profile.id}')" title="Delete" style="color: var(--error);">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        lucide.createIcons();
    }

    async function loadProfilesForSelect() {
        const profileSelect = document.getElementById('profileSelect');
        
        try {
            const response = await fetch('/api/profiles');
            if (!response.ok) throw new Error('Failed to load profiles');
            
            const profiles = await response.json();
            profileSelect.innerHTML = '<option value="">Select a profile...</option>' +
                profiles.map(profile => `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`).join('');
        } catch (error) {
            console.error('Error loading profiles for select:', error);
            profileSelect.innerHTML = '<option value="">Error loading profiles</option>';
        }
    }

    async function loadSelectedProfile() {
        const profileSelect = document.getElementById('profileSelect');
        const selectedId = profileSelect.value;
        
        if (!selectedId) return;
        
        try {
            const response = await fetch(`/api/profiles/${selectedId}`);
            if (!response.ok) throw new Error('Failed to load profile');
            
            const profile = await response.json();
            
            // Fill form fields with profile data
            Object.entries(profile.data).forEach(([fieldName, value]) => {
                const field = document.querySelector(`[name="${fieldName}"]`);
                if (field) {
                    field.value = value;
                }
            });
            
            // Show success message briefly
            const loadBtn = document.getElementById('loadProfileBtn');
            const originalText = loadBtn.innerHTML;
            loadBtn.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px; margin-right: 0.5rem;"></i>Loaded';
            loadBtn.disabled = true;
            
            setTimeout(() => {
                loadBtn.innerHTML = originalText;
                loadBtn.disabled = false;
                lucide.createIcons();
            }, 1500);
            
            lucide.createIcons();
        } catch (error) {
            console.error('Error loading profile:', error);
            showModalError(error.message);
        }
    }

    function openSaveProfileModal() {
        // Get current form data
        const formData = {};
        const formFields = document.querySelectorAll('#formFields input, #formFields textarea, #formFields select');
        
        formFields.forEach(field => {
            if (field.value.trim()) {
                formData[field.name] = field.value.trim();
            }
        });
        
        if (Object.keys(formData).length === 0) {
            showModalError('Please fill in some form fields before saving as a profile.');
            return;
        }
        
        currentProfileData = formData;
        
        const modal = document.getElementById('saveProfileModal');
        modal.classList.add('show');
        
        // Clear form
        document.getElementById('profileName').value = '';
        document.getElementById('profileDescription').value = '';
        document.getElementById('profileTags').value = '';
        document.getElementById('setAsDefault').checked = false;
        
        lucide.createIcons();
    }

    function closeSaveProfileModal() {
        const modal = document.getElementById('saveProfileModal');
        modal.classList.remove('show');
        currentProfileData = null;
    }

    async function saveProfile() {
        const name = document.getElementById('profileName').value.trim();
        const description = document.getElementById('profileDescription').value.trim();
        const tags = document.getElementById('profileTags').value.split(',').map(t => t.trim()).filter(t => t);
        const isDefault = document.getElementById('setAsDefault').checked;
        const errorDiv = document.getElementById('saveProfileError');
        
        errorDiv.style.display = 'none';
        
        if (!name) {
            errorDiv.textContent = 'Profile name is required';
            errorDiv.style.display = 'block';
            return;
        }
        
        const saveBtn = document.getElementById('saveProfileBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-lucide="loader-2" style="width: 16px; height: 16px; margin-right: 0.5rem; animation: spin 1s linear infinite;"></i>Saving...';
        
        try {
            const response = await fetch('/api/profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    description,
                    tags,
                    isDefault,
                    data: currentProfileData
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save profile');
            }
            
            closeSaveProfileModal();
            await loadProfilesForSelect(); // Refresh the select dropdown
            
            // Show success message
            const saveAsBtn = document.getElementById('saveAsProfileBtn');
            const originalSaveAsText = saveAsBtn.innerHTML;
            saveAsBtn.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px; margin-right: 0.5rem;"></i>Saved';
            
            setTimeout(() => {
                saveAsBtn.innerHTML = originalSaveAsText;
                lucide.createIcons();
            }, 2000);
            
        } catch (error) {
            console.error('Error saving profile:', error);
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            lucide.createIcons();
        }
    }

    function openCreateProfileModal() {
        currentEditProfileId = null;
        const modal = document.getElementById('createProfileModal');
        const title = document.getElementById('createProfileTitle');
        const btnText = document.getElementById('createProfileBtnText');
        
        title.innerHTML = '<i data-lucide="plus" style="width: 20px; height: 20px;"></i>Create New Profile';
        btnText.textContent = 'Create Profile';
        
        // Clear form
        document.getElementById('createProfileName').value = '';
        document.getElementById('createProfileDescription').value = '';
        document.getElementById('createProfileTags').value = '';
        document.getElementById('createSetAsDefault').checked = false;
        
        // Render common fields template
        renderCommonFields();
        
        modal.classList.add('show');
        lucide.createIcons();
    }

    function closeCreateProfileModal() {
        const modal = document.getElementById('createProfileModal');
        modal.classList.remove('show');
        currentEditProfileId = null;
    }

    function renderCommonFields() {
        const fieldsContainer = document.getElementById('createProfileFields');
        
        const commonFields = [
            { name: 'firstName', label: 'First Name', type: 'text' },
            { name: 'lastName', label: 'Last Name', type: 'text' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone', type: 'tel' },
            { name: 'address', label: 'Address', type: 'text' },
            { name: 'city', label: 'City', type: 'text' },
            { name: 'state', label: 'State', type: 'text' },
            { name: 'zip', label: 'ZIP Code', type: 'text' },
            { name: 'country', label: 'Country', type: 'text' },
            { name: 'company', label: 'Company', type: 'text' },
            { name: 'title', label: 'Job Title', type: 'text' },
            { name: 'ssn', label: 'SSN', type: 'text' },
            { name: 'dateOfBirth', label: 'Date of Birth', type: 'date' }
        ];
        
        fieldsContainer.innerHTML = commonFields.map(field => `
            <div class="profile-field">
                <label for="profile_${field.name}">${field.label}</label>
                <input type="${field.type}" id="profile_${field.name}" name="${field.name}" placeholder="Enter ${field.label.toLowerCase()}">
            </div>
        `).join('');
    }

    async function createProfile() {
        const name = document.getElementById('createProfileName').value.trim();
        const description = document.getElementById('createProfileDescription').value.trim();
        const tags = document.getElementById('createProfileTags').value.split(',').map(t => t.trim()).filter(t => t);
        const isDefault = document.getElementById('createSetAsDefault').checked;
        const errorDiv = document.getElementById('createProfileError');
        
        errorDiv.style.display = 'none';
        
        if (!name) {
            errorDiv.textContent = 'Profile name is required';
            errorDiv.style.display = 'block';
            return;
        }
        
        // Collect field data
        const data = {};
        const fields = document.querySelectorAll('#createProfileFields input');
        fields.forEach(field => {
            if (field.value.trim()) {
                data[field.name] = field.value.trim();
            }
        });
        
        const createBtn = document.getElementById('createProfileBtn');
        const originalText = createBtn.innerHTML;
        createBtn.disabled = true;
        createBtn.innerHTML = '<i data-lucide="loader-2" style="width: 16px; height: 16px; margin-right: 0.5rem; animation: spin 1s linear infinite;"></i>Saving...';
        
        try {
            const method = currentEditProfileId ? 'PUT' : 'POST';
            const url = currentEditProfileId ? `/api/profiles/${currentEditProfileId}` : '/api/profiles';
            
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, tags, isDefault, data })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save profile');
            }
            
            closeCreateProfileModal();
            await loadProfiles(); // Refresh profile list
            
        } catch (error) {
            console.error('Error saving profile:', error);
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
        } finally {
            createBtn.disabled = false;
            createBtn.innerHTML = originalText;
            lucide.createIcons();
        }
    }

    async function editProfile(profileId) {
        try {
            const response = await fetch(`/api/profiles/${profileId}`);
            if (!response.ok) throw new Error('Failed to load profile');
            
            const profile = await response.json();
            currentEditProfileId = profileId;
            
            const modal = document.getElementById('createProfileModal');
            const title = document.getElementById('createProfileTitle');
            const btnText = document.getElementById('createProfileBtnText');
            
            title.innerHTML = '<i data-lucide="edit-2" style="width: 20px; height: 20px;"></i>Edit Profile';
            btnText.textContent = 'Update Profile';
            
            // Fill form with profile data
            document.getElementById('createProfileName').value = profile.name;
            document.getElementById('createProfileDescription').value = profile.description || '';
            document.getElementById('createProfileTags').value = profile.tags ? profile.tags.join(', ') : '';
            document.getElementById('createSetAsDefault').checked = profile.isDefault;
            
            // Render fields and fill with data
            renderCommonFields();
            
            Object.entries(profile.data).forEach(([fieldName, value]) => {
                const field = document.querySelector(`#createProfileFields [name="${fieldName}"]`);
                if (field) {
                    field.value = value;
                }
            });
            
            modal.classList.add('show');
            lucide.createIcons();
            
        } catch (error) {
            console.error('Error loading profile for edit:', error);
            showProfileModalError(error.message);
        }
    }

    async function deleteProfile(profileId) {
        if (!confirm('Are you sure you want to delete this profile? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/profiles/${profileId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete profile');
            }
            
            await loadProfiles(); // Refresh profile list
            
        } catch (error) {
            console.error('Error deleting profile:', error);
            showProfileModalError(error.message);
        }
    }

    async function toggleDefaultProfile(profileId) {
        try {
            const response = await fetch(`/api/profiles/${profileId}/default`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update default profile');
            }
            
            await loadProfiles(); // Refresh profile list
            
        } catch (error) {
            console.error('Error updating default profile:', error);
            showProfileModalError(error.message);
        }
    }

    async function exportProfiles() {
        try {
            const response = await fetch('/api/profiles/export');
            if (!response.ok) throw new Error('Failed to export profiles');
            
            const profiles = await response.json();
            const dataStr = JSON.stringify(profiles, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = window.URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `profiles-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error exporting profiles:', error);
            showProfileModalError(error.message);
        }
    }

    function importProfiles() {
        document.getElementById('profileImportInput').click();
    }

    async function handleProfileImport(file) {
        try {
            const text = await file.text();
            const profiles = JSON.parse(text);
            
            if (!Array.isArray(profiles)) {
                throw new Error('Invalid file format: expected an array of profiles');
            }
            
            const response = await fetch('/api/profiles/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profiles })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to import profiles');
            }
            
            const result = await response.json();
            await loadProfiles(); // Refresh profile list
            
            alert(`Successfully imported ${result.imported} profiles. ${result.skipped} duplicates were skipped.`);
            
        } catch (error) {
            console.error('Error importing profiles:', error);
            showProfileModalError(error.message);
        }
    }

    function showProfileModalError(message) {
        const modalError = document.getElementById('profileModalError');
        modalError.textContent = message;
        modalError.style.display = 'block';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Recent Files Sidebar Management
    let recentFiles = [];
    
    
    
    // Load recent files from localStorage
    function loadRecentFilesFromStorage() {
        try {
            const stored = localStorage.getItem('recentFiles');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    recentFiles = parsed;
                    return true;
                }
            }
        } catch (error) {
            console.error('Error loading recent files from localStorage:', error);
        }
        return false;
    }
    
    // Save recent files to localStorage
    function saveRecentFilesToStorage() {
        try {
            localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
        } catch (error) {
            console.error('Error saving recent files to localStorage:', error);
        }
    }
    
    // Initialize sidebar on page load
    document.addEventListener('DOMContentLoaded', function() {
        initializeSidebar();
        loadRecentFiles();
    });
    
    function initializeSidebar() {
        const sidebar = document.getElementById('recentFilesSidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const mainContent = document.querySelector('.main-content');
        const clearBtn = document.getElementById('clearRecentFiles');
        const searchInput = document.getElementById('recentFilesSearch');
        
        console.log('=== INITIALIZING SIDEBAR ===');
        console.log('Sidebar element found:', !!sidebar);
        console.log('Main content found:', !!mainContent);
        
        // Load sidebar state from localStorage
        const savedState = localStorage.getItem('sidebarOpen');
        console.log('initializeSidebar - savedState from localStorage:', savedState);
        if (savedState !== null) {
            sidebarOpen = savedState === 'true';
        } else {
            // Default to open on desktop, closed on mobile
            sidebarOpen = window.innerWidth > 768;
        }
        console.log('initializeSidebar - initial sidebarOpen:', sidebarOpen);
        
        updateSidebarState();
        updateHeaderToggleIcon();
        
        // Event listeners
        sidebarToggle.addEventListener('click', toggleSidebar);
        mobileSidebarToggle.addEventListener('click', toggleSidebar);
        
        // Add header toggle listener
        const headerSidebarToggle = document.getElementById('headerSidebarToggle');
        if (headerSidebarToggle) {
            headerSidebarToggle.addEventListener('click', toggleSidebar);
        }
        sidebarOverlay.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebarOpen = false;
                updateSidebarState();
                saveSidebarState();
            }
        });
        
        // Clear recent files
        clearBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all recent files?')) {
                try {
                    if (window.electronAPI && window.electronAPI.clearRecentFiles) {
                        await window.electronAPI.clearRecentFiles();
                    }
                    recentFiles = [];
                    // Clear from localStorage as well
                    localStorage.removeItem('recentFiles');
                    updateRecentFilesList();
                } catch (error) {
                    console.error('Error clearing recent files:', error);
                }
            }
        });
        
        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filterRecentFiles(searchTerm);
        });
        
        // Handle window resize
        window.addEventListener('resize', updateSidebarState);
    }
    
    // Load recent files from Electron
    async function loadRecentFiles() {
        try {
            if (window.electronAPI && window.electronAPI.getRecentFiles) {
                // Try to get from Electron first
                recentFiles = await window.electronAPI.getRecentFiles() || [];
                // If empty, try localStorage as fallback
                if (recentFiles.length === 0) {
                    loadRecentFilesFromStorage();
                }
            } else {
                // No Electron API, use localStorage
                loadRecentFilesFromStorage();
            }
            updateRecentFilesList();
        } catch (error) {
            console.error('Error loading recent files:', error);
            // Fallback to localStorage
            loadRecentFilesFromStorage();
            updateRecentFilesList();
        }
    }
    
    // Add a file to recent files
    async function addToRecentFiles(filePath) {
        try {
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown.pdf';
            const newFile = {
                path: filePath,
                name: fileName,
                lastUsed: new Date().toISOString()
            };
            
            // Remove if already exists (to move to top)
            recentFiles = recentFiles.filter(f => f.path !== filePath);
            
            // Add to beginning
            recentFiles.unshift(newFile);
            
            // Keep only the most recent 10 files
            recentFiles = recentFiles.slice(0, 10);
            
            // Save via Electron if available
            if (window.electronAPI) {
                // Note: The Electron main process handles persistence
                // We just update our local array and UI
            }
            
            // Always save to localStorage as well (for persistence)
            saveRecentFilesToStorage();
            
            // Update UI
            updateRecentFilesList();
        } catch (error) {
            console.error('Error adding to recent files:', error);
        }
    }
    
    // Update recent files list in UI
    function updateRecentFilesList() {
        const container = document.getElementById('recentFilesList');
        
        if (!recentFiles || recentFiles.length === 0) {
            container.innerHTML = `
                <div class="no-recent-files">
                    <i data-lucide="file-text" style="width: 32px; height: 32px; opacity: 0.3;"></i>
                    <p>No recent files</p>
                    <small>Upload a PDF to get started</small>
                </div>
            `;
            // Re-initialize Lucide icons
            if (window.lucide) {
                lucide.createIcons();
            }
            return;
        }
        
        const html = recentFiles.map(file => createRecentFileItem(file)).join('');
        container.innerHTML = html;
        
        // Re-initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
        
        // Add event listeners to action buttons
        container.querySelectorAll('.recent-file-action').forEach(btn => {
            btn.addEventListener('click', handleRecentFileAction);
        });
    }
    
    // Create HTML for a recent file item
    function createRecentFileItem(file) {
        const fileName = file.name || 'Unknown File';
        const filePath = file.path || '';
        const lastAccessed = file.lastUsed ? new Date(file.lastUsed).toLocaleString() : 'Unknown';
        
        return `
            <div class="recent-file-item" data-file-path="${escapeHtml(filePath)}">
                <div class="recent-file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
                <div class="recent-file-time">${lastAccessed}</div>
                <div class="recent-file-actions">
                    <button class="recent-file-action" data-action="analyze">
                        <i data-lucide="search" style="width: 12px; height: 12px;"></i>
                        Analyze
                    </button>
                    <button class="recent-file-action" data-action="extract">
                        <i data-lucide="database" style="width: 12px; height: 12px;"></i>
                        Extract
                    </button>
                    <button class="recent-file-action" data-action="fill">
                        <i data-lucide="pen-tool" style="width: 12px; height: 12px;"></i>
                        Fill
                    </button>
                </div>
            </div>
        `;
    }
    
    // Handle recent file action clicks
    async function handleRecentFileAction(e) {
        e.stopPropagation();
        
        const button = e.currentTarget;
        const action = button.getAttribute('data-action');
        const fileItem = button.closest('.recent-file-item');
        const filePath = fileItem.getAttribute('data-file-path');
        
        if (!filePath) {
            console.error('No file path found');
            return;
        }
        
        try {
            // Set the file path for processing
            const fileName = filePath.split('/').pop() || 'unknown.pdf';
            
            // Set the selected file as a path (existing pattern in the app)
            selectedFile = filePath;
            selectedFileIsPath = true;
            
            // Update UI to show file is selected (simulate file selection)
            const dropZone = document.getElementById('dropZone');
            dropZone.innerHTML = `
                <div class="drop-zone-icon">
                    <i data-lucide="check-circle" style="width: 48px; height: 48px; color: var(--accent);"></i>
                </div>
                <p style="color: var(--accent); font-weight: 500;">${fileName}</p>
                <small>Ready to process</small>
            `;
            
            // Re-initialize Lucide icons
            if (window.lucide) {
                lucide.createIcons();
            }
            
            // Trigger the action using processFile function
            switch (action) {
                case 'analyze':
                    await processFile('analyze');
                    break;
                case 'extract':
                    await processFile('extract');
                    break;
                case 'fill':
                    await processFile('fill');
                    break;
                default:
                    console.warn('Unknown action:', action);
            }
            
            // Close sidebar on mobile after action
            if (window.innerWidth <= 768) {
                sidebarOpen = false;
                document.getElementById('recentFilesSidebar').classList.remove('open');
                document.getElementById('sidebarOverlay').classList.remove('show');
                document.body.style.overflow = '';
            }
            
        } catch (error) {
            console.error('Error handling recent file action:', error);
            showError('Failed to process file: ' + error.message);
        }
    }
    
    // Filter recent files based on search term
    function filterRecentFiles(searchTerm) {
        const fileItems = document.querySelectorAll('.recent-file-item');
        
        fileItems.forEach(item => {
            const fileName = item.querySelector('.recent-file-name').textContent.toLowerCase();
            const matches = fileName.includes(searchTerm);
            item.classList.toggle('hidden', !matches);
        });
    }
    
    // Listen for recent files updates from Electron
    if (window.electronAPI && window.electronAPI.onRecentFilesUpdated) {
        window.electronAPI.onRecentFilesUpdated((updatedFiles) => {
            recentFiles = updatedFiles || [];
            updateRecentFilesList();
        });
    }
    
    // Refresh icons after theme changes
    const originalApplyTheme = applyTheme;
    if (typeof originalApplyTheme === 'function') {
        window.applyTheme = function(themeName) {
            originalApplyTheme(themeName);
            // Re-initialize icons after theme change
            setTimeout(() => {
                if (window.lucide) {
                    lucide.createIcons();
                }
            }, 100);
        };
    }

    // Global variable to store current profile data when saving
    let currentProfileData = null;
      // Expose functions to the global scope for inline onclick handlers
  window.toggleSettings = toggleSettings;
  window.selectTheme = selectTheme;
  window.signOut = signOut;
  window.switchAccount = switchAccount;
  window.handleGoogleSignIn = handleGoogleSignIn;
  window.resetUpload = resetUpload;
  window.copyToClipboard = copyToClipboard;
  window.downloadResult = downloadResult;
  window.refreshIntelligence = refreshIntelligence;
  // Modal Functions
  window.openFormFillModal = openFormFillModal;
  window.closeFormFillModal = closeFormFillModal;
  window.submitPassword = submitPassword;
  window.fillAndSavePDF = fillAndSavePDF;
  window.openBulkFillModal = openBulkFillModal;
  window.closeBulkFillModal = closeBulkFillModal;
  window.selectTemplatePDF = selectTemplatePDF;
  window.selectCSVFile = selectCSVFile;
  window.selectOutputDirectory = selectOutputDirectory;
  window.startBulkFill = startBulkFill;
  window.downloadBulkSummary = downloadBulkSummary;
  // Profile Functions
  window.openProfileModal = openProfileModal;
  window.closeProfileModal = closeProfileModal;
  window.openCreateProfileModal = openCreateProfileModal;
  window.closeCreateProfileModal = closeCreateProfileModal;
  window.createProfile = createProfile;
  window.editProfile = editProfile;
  window.deleteProfile = deleteProfile;
  window.toggleDefaultProfile = toggleDefaultProfile;
  window.openSaveProfileModal = openSaveProfileModal;
  window.closeSaveProfileModal = closeSaveProfileModal;
  window.saveProfile = saveProfile;
  window.loadSelectedProfile = loadSelectedProfile;
  window.exportProfiles = exportProfiles;
  window.importProfiles = importProfiles;
  // Sidebar function
  window.toggleSidebar = toggleSidebar;
  // Theme and processing functions for keyboard shortcuts
  window.cycleTheme = cycleTheme;
  window.processFile = processFile;
});