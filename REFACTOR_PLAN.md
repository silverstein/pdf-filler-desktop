# JavaScript Refactoring Plan for PDF Filler

## Current Problem
- Single 2600+ line `app.js` file
- No separation of concerns
- Hard to maintain and test
- Functions scattered throughout

## Proposed Structure

```
public/
├── js/
│   ├── core/
│   │   ├── app.js              # Main initialization & bootstrapping
│   │   ├── auth.js             # Authentication (Google sign-in, auth checks)
│   │   ├── state.js            # Global state management
│   │   └── config.js           # Configuration constants
│   │
│   ├── features/
│   │   ├── pdf-processor.js    # PDF analysis, extraction, validation
│   │   ├── form-fill.js        # Form filling logic
│   │   ├── bulk-operations.js  # Bulk fill functionality
│   │   ├── profiles.js         # Profile management
│   │   ├── intelligence.js     # Document intelligence/insights
│   │   └── recent-files.js     # Recent files management
│   │
│   ├── ui/
│   │   ├── theme-manager.js    # Theme switching & persistence
│   │   ├── modals.js           # All modal dialogs
│   │   ├── sidebar.js          # Sidebar toggle & management
│   │   ├── notifications.js    # Toast notifications & alerts
│   │   └── dropzone.js         # File upload/drag-drop handling
│   │
│   ├── utils/
│   │   ├── keyboard-shortcuts.js  # All keyboard shortcuts
│   │   ├── file-utils.js          # File handling utilities
│   │   ├── dom-helpers.js         # DOM manipulation helpers
│   │   └── api-client.js          # Server API calls
│   │
│   └── main.js                 # Entry point that loads all modules
│
├── index.html
├── styles.css
└── themes.css
```

## Module Pattern Options

### Option 1: ES6 Modules (Recommended for modern browsers)
```javascript
// theme-manager.js
export class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('selectedTheme') || 'mono';
    }
    
    apply(themeName) { /* ... */ }
    cycle() { /* ... */ }
}

// main.js
import { ThemeManager } from './ui/theme-manager.js';
const themeManager = new ThemeManager();
```

### Option 2: Revealing Module Pattern (Works everywhere)
```javascript
// theme-manager.js
const ThemeManager = (function() {
    let currentTheme = localStorage.getItem('selectedTheme') || 'mono';
    
    function apply(themeName) { /* ... */ }
    function cycle() { /* ... */ }
    
    return {
        apply,
        cycle,
        getCurrentTheme: () => currentTheme
    };
})();

// Attach to window for global access
window.PDFApp = window.PDFApp || {};
window.PDFApp.ThemeManager = ThemeManager;
```

### Option 3: Simple Object Namespace (Simplest)
```javascript
// Create namespace
window.PDFApp = {
    Auth: {},
    Theme: {},
    PDF: {},
    UI: {},
    Utils: {}
};

// theme-manager.js
PDFApp.Theme = {
    current: localStorage.getItem('selectedTheme') || 'mono',
    
    apply(themeName) { /* ... */ },
    cycle() { /* ... */ }
};
```

## Benefits of This Structure

1. **Separation of Concerns**: Each module handles one specific area
2. **Maintainability**: Easy to find and modify specific functionality
3. **Testability**: Can test modules independently
4. **Reusability**: Modules can be reused in other projects
5. **Performance**: Can lazy-load modules as needed
6. **Collaboration**: Multiple developers can work on different modules

## Migration Strategy

### Phase 1: Create Structure (No breaking changes)
1. Create folder structure
2. Create new module files with empty shells
3. Keep app.js working as-is

### Phase 2: Extract & Refactor
1. Move authentication logic → `auth.js`
2. Move theme logic → `theme-manager.js`
3. Move PDF operations → `pdf-processor.js`
4. Move modal logic → `modals.js`
5. Move keyboard shortcuts → `keyboard-shortcuts.js`

### Phase 3: Wire Everything Together
1. Create `main.js` entry point
2. Update `index.html` to load modules
3. Test all functionality
4. Remove old `app.js`

## Keyboard Shortcuts Module Example

```javascript
// utils/keyboard-shortcuts.js
PDFApp.KeyboardShortcuts = {
    shortcuts: {
        'cmd+t': { action: 'cycleTheme', description: 'Cycle through themes' },
        'cmd+o': { action: 'openFile', description: 'Open file picker' },
        'cmd+,': { action: 'openSettings', description: 'Open settings' },
        'cmd+b': { action: 'toggleSidebar', description: 'Toggle sidebar' },
        'cmd+d': { action: 'clearFile', description: 'Clear current file' },
        'cmd+k': { action: 'clearRecent', description: 'Clear recent files' },
        'cmd+?': { action: 'showHelp', description: 'Show keyboard shortcuts' },
        'cmd+1': { action: 'analyze', description: 'Analyze PDF' },
        'cmd+2': { action: 'extract', description: 'Extract data' },
        'cmd+3': { action: 'fill', description: 'Fill form' },
        'escape': { action: 'closeModal', description: 'Close current modal' }
    },
    
    init() {
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    },
    
    handleKeydown(e) {
        const key = this.getKeyCombo(e);
        const shortcut = this.shortcuts[key];
        
        if (shortcut && PDFApp.State.isAuthenticated) {
            e.preventDefault();
            this.executeAction(shortcut.action);
        }
    },
    
    getKeyCombo(e) {
        const parts = [];
        if (e.metaKey || e.ctrlKey) parts.push('cmd');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        parts.push(e.key.toLowerCase());
        return parts.join('+');
    },
    
    executeAction(action) {
        const actions = {
            cycleTheme: () => PDFApp.Theme.cycle(),
            openFile: () => PDFApp.FileHandler.open(),
            toggleSidebar: () => PDFApp.UI.Sidebar.toggle(),
            // ... etc
        };
        
        if (actions[action]) {
            actions[action]();
        }
    },
    
    showHelp() {
        // Display keyboard shortcuts modal
        PDFApp.UI.Modals.showKeyboardShortcuts(this.shortcuts);
    }
};
```

## Questions to Consider

1. **Module System**: ES6 modules, revealing module pattern, or simple namespace?
2. **Build Process**: Add bundler (webpack/rollup) or keep it simple?
3. **TypeScript**: Worth adding for better type safety?
4. **Testing**: Add Jest or another testing framework?
5. **State Management**: Simple object or something more robust?

## Next Steps

1. Agree on module pattern
2. Create folder structure
3. Start with one module (e.g., keyboard shortcuts)
4. Gradually refactor other parts
5. Update documentation