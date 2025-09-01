# CLAUDE.md - PDF Filler Desktop

## Project Overview
PDF Filler Desktop is a native Electron application that provides **completely free** PDF processing using Google's Gemini AI. Users authenticate with their Google account (OAuth) and get access to AI-powered PDF analysis, form filling, and data extraction - all without API keys or costs.

**GitHub Repository**: https://github.com/silverstein/pdf-filler-desktop

## Core Concept
- **NO API keys required** - Uses OAuth authentication only
- **NO costs** - Leverages Gemini's generous free tier (60 req/min, 1000 req/day, 1M token context)
- **Local Gemini CLI instance** - Each user gets their own isolated Gemini installation
- **Direct file access** - Gemini CLI reads PDFs directly from the filesystem

## Architecture

### Key Components
1. **Electron Desktop App** (`src/electron.js`)
   - System tray integration
   - Local server management
   - OAuth flow handling

2. **Express Server** (`src/server.js`)
   - PDF processing endpoints (both file paths and uploads)
   - Native file path support via `/api/analyze-local`, `/api/extract-local`
   - Runs on localhost:3456

3. **Gemini Simple Bridge** (`src/gemini-simple.js`)
   - Passes file paths directly to Gemini CLI
   - Handles rate limiting
   - Cleans output (removes "Loaded cached credentials" etc.)

4. **Auth Handler** (`src/simple-auth-handler.js`)
   - Opens Terminal for first-time auth
   - Monitors for auth completion
   - Manages local credentials

## How It Works

### Authentication Flow
1. User clicks "Sign in with Google"
2. App opens Terminal with local Gemini CLI
3. User completes OAuth in browser
4. Credentials saved to `gemini-cli-local/.gemini/`
5. App detects auth completion and switches to main UI

### PDF Processing
1. User selects PDF using native file dialog (no upload needed)
2. App passes absolute file path to Gemini: `"Analyze the PDF at: /full/path/to/file.pdf"`
3. Gemini CLI uses MCP filesystem server to access files anywhere on system
4. Gemini analyzes PDF and returns structured JSON
5. App displays results in themed UI

## Important Notes

### Local Gemini Instance
- Installed at `gemini-cli-local/`
- Uses `HOME` environment variable override to isolate config
- Each user's credentials stay on their machine only
- MCP filesystem server configured at `gemini-cli-local/.gemini/mcp_servers.json`
- Can access files anywhere on system via MCP

### Rate Limiting
- 50 requests/minute (with buffer from 60 limit)
- 900 requests/day (with buffer from 1000 limit)
- 2-minute timeout for long operations

### Known Issues & Solutions
1. **"Loaded cached credentials" in output**: Already filtered in `gemini-simple.js`
2. **Long processing times**: Increased timeout to 2 minutes, added visual timer
3. **Workspace accounts**: Require `GOOGLE_CLOUD_PROJECT` env var (set to dummy value)

## Current Status

### ✅ Completed
- Native file selection (no uploads needed)
- MCP filesystem integration for broad file access
- Multiple UI themes (Dark, Light, Ocean, Forest, etc.)
- Recent files tracking
- System tray integration
- Google OAuth authentication
- PDF analysis and data extraction

### 🚧 In Progress
- Adding pdf-lib for actual form filling
- Implementing write-back functionality

### ❌ Remaining TODOs

See [FEATURES.md](FEATURES.md) for complete feature parity roadmap with pdf-filler-simple.

**High Priority:**
- [ ] **Actual Form Filling** - Write data back to PDFs using pdf-lib
- [ ] **Password Support** - Handle encrypted PDFs
- [ ] **Better Fill Form UI** - Modal dialog instead of prompt()
- [ ] **Bulk CSV Processing** - Fill multiple PDFs from spreadsheet

### Medium Priority
- [ ] **Profile System**
  - Save commonly used data (addresses, names, etc.)
  - Quick-fill from saved profiles
  - Import/export profiles

- [ ] **Error Recovery**
  - Better error messages for common issues
  - Retry logic for rate limits
  - Graceful handling of malformed PDFs

- [ ] **Visual PDF Preview**
  - Show PDF pages in UI
  - Highlight detected form fields
  - Preview before/after for filled forms

### Low Priority
- [ ] **Auto-update system**
- [ ] **Usage statistics dashboard**
- [ ] **Dark mode theme**
- [ ] **Keyboard shortcuts**
- [ ] **Drag-drop from Finder to system tray**

## Development Commands

```bash
# Install dependencies
npm install

# Start app (Electron + server)
npm start

# Run server only (for testing)
npm run server

# Run setup wizard
npm run setup

# Test local Gemini CLI
HOME=./gemini-cli-local ./gemini-cli-local/node_modules/.bin/gemini -p "test"

# Build standalone app for distribution
npm run build

# Clean build (if build fails or hangs)
rm -rf dist && npm run build

# Force kill any hanging build processes
pkill -f electron-builder || true
pkill -f node || true
```

### Build Troubleshooting

#### Common Build Issues and Solutions

1. **Build hangs or times out**
   - The build process can take 2-3 minutes, especially DMG creation
   - If it hangs beyond 5 minutes, force clean and rebuild:
   ```bash
   # Kill any stuck processes
   pkill -f electron-builder
   pkill -f node
   
   # Clean and rebuild
   rm -rf dist
   npm run build
   ```

2. **"Directory not empty" errors**
   - This happens when the dist folder has locked files
   - Solution: Force remove with `rm -rf dist` before building

3. **Code signing warnings**
   - You'll see warnings about missing "Developer ID Application" identity
   - These are safe to ignore for local builds
   - The app will still work but may show security warnings on first launch

4. **TypeScript compilation errors**
   - Run `npx tsc --noEmit` to check for TypeScript errors before building
   - Fix any type errors before attempting to build

5. **Post-build script failures**
   - The post-build script sets permissions and creates necessary directories
   - If it fails, you can run it manually: `node scripts/post-build.js`

### Clean Build Process

For a guaranteed clean build:
```bash
# 1. Stop any running instances
pkill -f "PDF Filler" || true

# 2. Clean all build artifacts
rm -rf dist
rm -rf node_modules/.cache

# 3. Ensure TypeScript compiles
npx tsc --noEmit

# 4. Build the app
npm run build

# 5. Test the built app
open "dist/mac-arm64/PDF Filler.app"
```

## 🚨 CRITICAL: Electron + Gemini CLI Integration (DO NOT BREAK THIS!)

### The Problem We Solved
Gemini CLI wouldn't work with Electron's built-in Node due to a yargs argv parsing issue. After hours of debugging with GPT-5 Pro, we discovered that `yargs/helpers.hideBin()` treats ELECTRON_RUN_AS_NODE differently - it only removes 1 argv element instead of 2, causing Gemini CLI to see its own script path as an "Unknown argument".

### The Solution: gemini-electron-shim.js
**DO NOT DELETE OR MODIFY THE SHIM WITHOUT UNDERSTANDING IT!**

The shim (`gemini-cli-local/gemini-electron-shim.js`) normalizes argv before Gemini CLI loads:
- When running in Electron: Sets argv to `[execPath, ...args]` (omits script path)
- When running in Node: Sets argv to `[execPath, scriptPath, ...args]`

This ensures `hideBin(process.argv)` works correctly in both contexts.

### How It Works
1. App uses Electron v37's built-in Node (has the File global that undici needs)
2. GeminiCLIService spawns: `[electron, shim, gemini-cli, ...args]`
3. Shim normalizes argv based on context
4. Gemini CLI sees correct arguments

### ⚠️ DO NOT:
- Remove or rename `gemini-electron-shim.js`
- Downgrade Electron below v37 (needs Node 22+ with File global)
- Try to call Gemini CLI directly without the shim
- Disable ELECTRON_AS_NODE in node-locator
- Change how GeminiCLIService invokes the shim

### Requirements
- **Electron v37+** (contains Node v22+ with File global)
- **The shim must be used** when running with ELECTRON_RUN_AS_NODE
- **Users don't need Node.js installed** - the app is standalone!

## Critical Authentication Fix (August 2024)

### Problem
Authentication was broken in the packaged Electron app due to:
1. Symlink `.bin/gemini` not working in packaged apps
2. AppleScript permissions blocked by macOS
3. Missing environment variable `GOOGLE_GENAI_USE_GCA`
4. Incorrect path resolution in packaged vs development

### Solution
1. **Use actual Gemini CLI path** instead of symlink:
   - `gemini-cli-local/node_modules/@google/gemini-cli/dist/index.js`
   
2. **Use `open -a Terminal` with temp script** instead of AppleScript:
   - Create temp shell script
   - Open with Terminal app
   - Auto-cleanup after 5 seconds

3. **Set required environment variables**:
   ```bash
   export HOME='[gemini-cli-local path]'
   export GOOGLE_CLOUD_PROJECT='pdf-filler-desktop'  # Dummy value
   export GOOGLE_GENAI_USE_GCA=true  # Enable OAuth flow
   ```

4. **Correct path resolution**:
   - Dev: `path.join(__dirname, '..')`  
   - Packaged: `path.join(process.resourcesPath, 'app.asar.unpacked')`

### Authentication Flow
1. User clicks "Sign in with Google"
2. App creates temp shell script with auth command
3. Terminal opens and runs Gemini CLI
4. Browser opens with Google OAuth
5. User signs in with regular Google account
6. Credentials saved to `gemini-cli-local/.gemini/`
7. App detects auth completion and refreshes

## Building the Electron App

### IMPORTANT: Build Configuration
The `package.json` build configuration MUST include all necessary files:

```json
"build": {
  "files": [
    "src/**/*",           // All source code
    "public/**/*",        // Web UI files
    "gemini-cli-local/**/*", // CRITICAL: Local Gemini installation
    "assets/**/*",        // Icons and resources
    "scripts/**/*",       // Setup scripts
    "uploads/.gitkeep",   // Upload directory structure
    "package.json",       // Package metadata
    "CLAUDE.md",         // Documentation
    "README.md"          // User documentation
  ]
}
```

### Common Build Issues
1. **"Gemini CLI Not Found" in built app**: The `gemini-cli-local` folder wasn't included in the build. Check the `files` array in package.json.
2. **No tray icon on macOS**: The app uses text "📄 PDF" instead of an icon. This is intentional since no icon file exists.
3. **Window doesn't open**: Usually means the server failed to start. Check Console.app for error logs.

## File Structure
```
gemini-pdf-filler/
├── src/
│   ├── electron.js         # Main Electron process
│   ├── server.js           # Express API server
│   ├── gemini-simple.js    # Gemini CLI interface
│   ├── simple-auth-handler.js # OAuth flow handler
│   └── preload.js          # Electron preload script
├── public/
│   └── index.html          # Web UI
├── gemini-cli-local/       # Local Gemini installation
│   └── .gemini/           # User credentials (git-ignored)
├── uploads/               # Temporary PDF storage
└── package.json
```

## Testing Different Scenarios

### Test with Fresh Auth
```bash
rm -rf gemini-cli-local/.gemini/oauth_creds.json
rm -rf gemini-cli-local/.gemini/google_accounts.json
npm start
```

### Test with Different Account Types
- Personal Gmail: Works perfectly
- Workspace account: Needs `GOOGLE_CLOUD_PROJECT` env var
- Code Assist account: Use personal Gmail instead

### Test PDF Operations via the App
The app uses Express server endpoints, NOT direct Gemini CLI calls. Always test through the server:

```bash
# Test extraction endpoint (this is what the app uses):
curl -X POST http://localhost:3456/api/extract \
  -F "pdf=@uploads/your-pdf-file.pdf" \
  | python3 -m json.tool

# Test other endpoints:
curl http://localhost:3456/api/health     # Check system status
curl -X POST http://localhost:3456/api/analyze -F "pdf=@uploads/file.pdf"   # Analyze PDF structure
curl -X POST http://localhost:3456/api/validate -F "pdf=@uploads/file.pdf"  # Validate form
```

### Direct Gemini CLI Testing (for debugging only)
```bash
# IMPORTANT: Must run from project root directory!
cd /Users/silverbook/Sites/gemini-pdf-filler

# Test with Flash model:
HOME=./gemini-cli-local ./gemini-cli-local/node_modules/.bin/gemini \
  -m gemini-2.5-flash \
  -p 'Look at the PDF at: uploads/test.pdf. Tell me what information you see. Format as JSON.'

# Test with Pro model (when quota available):
HOME=./gemini-cli-local ./gemini-cli-local/node_modules/.bin/gemini \
  -m gemini-2.5-pro \
  -p 'Extract all data from the PDF at: uploads/test.pdf. Return as JSON.'
```

## CRITICAL: How PDF Processing Actually Works

### The Architecture
1. **User uploads PDF** → Express server (`/api/extract`)
2. **Server calls** → `gemini.extractPDFData()` in `gemini-simple.js`
3. **Gemini Simple** → Spawns Gemini CLI process with file path
4. **Gemini CLI** → Reads PDF directly from filesystem
5. **Response** → JSON parsed and returned to user

### Key Insights
- **Direct file access**: Gemini CLI can read PDFs directly when given the path!
- **No extraction needed**: Don't extract text or encode base64 - just pass the path
- **Relative paths**: Use paths relative to project root (e.g., `uploads/file.pdf`)
- **Singleton instance**: One `GeminiSimple` instance handles all requests

### Common Issues & Solutions

#### Flash Model Refuses to Process PDFs
Flash sometimes says "I cannot directly read PDFs". The app handles this with:
1. Retry logic with different prompt phrasings (up to 3 attempts)
2. Simpler language: "Look at" instead of "Extract from"
3. Multiple prompt variations in `singleExtraction` method

#### Rate Limiting / Quota Issues
- **Pro model**: 60 req/min, 1000/day (but shared with other Google services)
- **Flash model**: Higher limits, used as automatic fallback
- **Automatic switching**: When Pro quota exhausted, `useFlashFallback` = true
- **Current state**: Forced to Flash due to Pro quota limits

#### Accuracy Considerations
- **Flash model**: ~95% accuracy on form extraction
- **Pro model**: ~98% accuracy (when available)
- **Consensus approach**: Tested but didn't improve accuracy, just added latency
- **Current approach**: Single extraction for speed

#### Python Boolean Issue
Gemini sometimes returns Python-style booleans (`True`/`False`). Fixed in `singleExtraction`:
```javascript
const jsonString = jsonMatch[0]
  .replace(/\bTrue\b/g, 'true')
  .replace(/\bFalse\b/g, 'false')
  .replace(/\bNone\b/g, 'null');
```

## Security Considerations
- Never commit `gemini-cli-local/.gemini/` (contains user credentials)
- PDFs in `uploads/` should be cleaned periodically
- Each user's auth is isolated to their machine
- No data sent to external servers (except Gemini AI calls)

## 📋 IMPORTANT: Implementation Tracking

**CHECK [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) FIRST!**

This file contains:
- All development tasks with checkboxes to track progress
- Technical architecture decisions
- Current state of each feature
- What to work on next

**How to use it:**
1. Read IMPLEMENTATION_PLAN.md to see what's been done (checked boxes)
2. Pick the next unchecked task
3. Update checkboxes as you complete tasks
4. Commit changes to track progress

## Integration Plans

This project will eventually merge with [pdf-filler-simple](https://github.com/silverstein/pdf-filler-simple) to create a unified PDF Filler ecosystem:

- **Desktop App** (this project) - Electron + Gemini for free desktop use
- **Claude Extension** (DXT) - For Claude Desktop users
- **MCP Server** - For Cursor/VSCode integration
- **Shared Core** - Common PDF operations across all platforms

See [MERGER_PROPOSAL.md](MERGER_PROPOSAL.md) for detailed plans.

## Key Technical Insights

1. **Direct File Access**: Gemini CLI can read files directly when given absolute paths
2. **MCP Filesystem**: Enables access to files anywhere on system
3. **No Upload Needed**: Native file dialogs preserve user workflow
4. **Free Tier Magic**: 60 req/min is more than enough for personal **use**