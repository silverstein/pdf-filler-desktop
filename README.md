# PDF Filler Desktop - Free AI-Powered PDF Processing

A native desktop application for PDF form filling and analysis, powered by Google's Gemini AI - **completely free** using Gemini's generous free tier. No API keys required!

## ✨ Current Features

### Core Capabilities
- 🖥️ **Native Desktop App** - System tray integration, works offline
- 📂 **Native File Selection** - No uploads needed, works with files anywhere on your system
- 📄 **Analyze PDFs** - Extract structure, form fields, and content
- 📊 **Extract Data** - Convert PDF content to structured JSON
- 📖 **Read Full Text** - Extract complete text content from PDFs
- 🔒 **Privacy First** - All processing happens locally
- 🎨 **Styled Authentication** - Custom terminal window with mono theme for OAuth flow

### Form Processing
- ✏️ **Fill Forms** - Write data back to PDFs with support for text, checkboxes, dropdowns, and more
- ✅ **Validate Forms** - Check for missing required fields
- 🔐 **Password Support** - Handle encrypted and password-protected PDFs

### Advanced Features
- 🔄 **Bulk Processing** - Process multiple PDFs from CSV data with template-based filling
- 👤 **Profile System** - Save and reuse common form data with secure encryption
- 📝 **Recent Files** - Quick access to recently processed PDFs
- 🎨 **Multiple Themes** - Brutalist, Glassmorphic, Neubrutalism, Gruvbox, and Mono

## 🚧 Coming Soon

- 📤 **Export to CSV** - Extract data from multiple PDFs to spreadsheet
- 👁️ **OCR Support** - Extract text from scanned PDFs using vision capabilities

## 🚀 Quick Start

### For Users (Download Pre-built App)

1. **Google Account** - For Gemini authentication (OAuth)
2. **Platforms**
   - macOS: primary target with ready-made builds
   - Windows/Linux: supported; build locally to generate an installer/binary
3. **No Node.js required!** - The pre-built app is completely standalone

On macOS, download the latest release from the [Releases page](https://github.com/silverstein/pdf-filler-desktop/releases) and drag to Applications. On Windows/Linux, build locally (see below) to produce the installer/artifact.

### For Developers (Build from Source)

**Prerequisites for Development:**
- Node.js v18+ (we recommend Node 22 LTS for local tooling; app runtime uses Electron’s embedded Node)
- npm or pnpm

```bash
# Clone the repository
git clone https://github.com/silverstein/pdf-filler-desktop
cd pdf-filler-desktop

# Install dependencies
npm install
```

### Build Prerequisites (for developers)

- Bundled Codex CLI: the packaged app includes a Codex binary so end users do not need Node/npm.
  - Ensure Codex is installed and on PATH on the build machine before running `npm run build`.
  - Verify with `codex --version` and `which codex` (e.g., `/Users/you/.local/bin/codex`).
  - The prebuild step (`scripts/prepare-codex.js`) copies the resolved binary into `codex-cli-local/bin/codex` so electron-builder bundles it (see `electron-builder.yml`).
  - If PATH is unusual, run the build from the shell where `which codex` resolves.
- Gemini CLI is already handled via `gemini-cli-local/` and a post-build copy.
- Build on a machine that matches the release target architecture (e.g., Apple Silicon for macOS arm64).

### Configuration (Optional)

**Most users don't need any configuration!** The app works out of the box for:
- ✅ Regular Gmail accounts
- ✅ Google Workspace accounts (the app handles this automatically)

**The only time you might need a .env file:**
- You want to use a different port (default is 3456)

If you need to change the port:
1. Copy `.env.example` to `.env`
2. Change the PORT value

### Running the App

```bash
# Start the desktop app (opens window + system tray)
npm start

# Alternative commands:
npm run electron   # Same as npm start
npm run server     # Server only (no window)
npm run dev        # Development mode with auto-restart
```

**Note**: On first run, you'll need to authenticate with Google OAuth when prompted.

The app will:
- Install a local Gemini CLI instance automatically
- Guide you through Google OAuth authentication
- Create a system tray icon for easy access
- Open the main window with the UI

### First-Time Authentication

1. Click "Sign in with Google" in the app
2. A custom styled terminal window opens (600x400px, mono theme)
3. The authentication process starts automatically
4. Your browser opens for Google OAuth
5. Sign in with your Google account
6. The terminal window shows progress and auto-closes on success

No API keys needed - just your Google account!

## 🧪 Testing

Lightweight tests are provided using ts-node scripts (no extra test framework needed). Optional Vitest suite is included for unit/integration tests.

Commands:

```bash
# Run all ts-node smoke tests (default)
npm test                 # same as npm run test:scripts

# Run specific ts-node suites
npm run test:csv         # CSVService sanity
npm run test:pdf         # PDFService (creates a temp PDF with a form)
**npm run test:pr**ofiles    # ProfileService (uses a temp HOME dir)
npm run test:api         # Server health endpoint smoke test

# Vitest unit/integration tests (install dev deps first)
npm i -D vitest @vitest/coverage-v8 supertest
npm run test:unit        # runs Vitest suites in src/**/*.test.ts
npm run test:watch       # watch mode
npm run test:coverage    # coverage via V8
```

Notes:
- Tests write temporary files under `temp/`; safe to delete.
- The API test starts the server with ts-node and terminates it automatically.
- TypeScript type-checking (`npm run build:ts`) also serves as a safety net.

Optional, for larger suites later:
- Electron e2e: a Playwright smoke test is included. To run locally:
  ```bash
  npm i -D @playwright/test
  npm run build:ts
  npm run test:e2e
  ```
  It launches Electron against `dist/electron.js` and asserts the main window loads.
- If you want this set up, open an issue and we’ll add config + example specs.

## 🧭 Node Versions

- The packaged app runs on Electron’s embedded Node (separate from your system Node).
- For local development, we recommend Node 22 LTS. A `.nvmrc` is provided; run `nvm use` if you use nvm.
- `package.json` includes `engines.node: ">=18"` as guidance only (no strict enforcement).

## 🪟 Windows & 🐧 Linux Notes

- Windows and Linux are supported targets in `electron-builder.yml` (Windows NSIS, Linux AppImage).
- To produce a Windows installer, build on a Windows machine:
  ```bash
  npm ci
  npm run build
  # Outputs an NSIS installer under dist/
  ```
- To produce a Linux AppImage, build on a Linux machine with the necessary system deps:
  ```bash
  npm ci
  npm run build
  # Outputs an AppImage under dist/
  ```
- Authentication:
  - macOS/Linux: opens custom styled terminal window (mono theme) for OAuth flow
  - Windows: opens Command Prompt for Gemini CLI OAuth (fallback to system terminal)
- CI covers macOS and Windows for build + tests; Electron e2e smoke runs on macOS by default.

## 🎮 Usage

### Finding the App

After running `npm start`:
1. **Check your menu bar** (Mac) or system tray (Windows/Linux) for the 📄 PDF icon
2. **Click the icon** and select "Open PDF Filler" if the window doesn't appear
3. **Window opens** with the PDF Filler interface

The desktop app provides:
- 📁 **Native file selection** - Click or drag to select PDFs from anywhere
- 🔧 **System tray integration** - Runs in background, always accessible
- 🎨 **Beautiful themes** - Multiple color schemes to choose from
- 📊 **Recent files sidebar** - Quick access to previously processed PDFs
- ⚡ **Fast processing** - Direct file access, no uploads needed

### Development Mode

```bash
# Run with DevTools open
DEBUG=1 npm **start**
```

### API Endpoints (For Developers)

Start the server and use these endpoints:

```javascript
// Analyze PDF structure
POST /api/analyze
Body: FormData with 'pdf' file

// Extract data from PDF
POST /api/extract
Body: FormData with 'pdf' file and optional 'template' JSON

// Fill PDF form
POST /api/fill
Body: FormData with 'pdf' file and 'data' JSON

// Validate PDF form
POST /api/validate
Body: FormData with 'pdf' file and 'requiredFields' array

// Compare two PDFs
POST /api/compare
Body: FormData with 2 'pdfs' files

// Bulk process from CSV
POST /api/bulk
Body: FormData with 'template' PDF and 'csv' file
```

## 💰 Cost: FREE!

This application leverages Google's generous Gemini free tier:

| Feature | Free Limit | Notes |
|---------|------------|-------|
| Requests per minute | 60 | More than enough for personal use |
| Requests per day | 1,000 | Process hundreds of PDFs daily |
| Context window | 1M tokens | Handle massive PDFs |
| Monthly cost | $0 | Completely free! |

## 🏗️ Architecture

```
pdf-filler-desktop/
├── src/
│   ├── electron.js       # Main Electron process
│   ├── server.js         # Express API server
│   ├── gemini-simple.js  # Gemini CLI integration
│   ├── preload.js        # Electron preload script
│   └── simple-auth-handler.js # OAuth management
├── public/
│   ├── index.html        # Main UI (with themes)
│   └── themes.css        # Theme definitions
├── gemini-cli-local/     # Local Gemini instance
│   └── .gemini/         # User credentials (git-ignored)
└── uploads/             # Temporary file storage
```

### How It Works

1. **Native File Selection** - User selects PDF using native OS dialog (no upload needed)
2. **MCP Filesystem Access** - Gemini accesses files directly via Model Context Protocol
3. **AI Analysis** - Gemini 2.5 Flash/Pro analyzes the PDF with native PDF understanding
4. **Structured Response** - Gemini returns structured JSON data
5. **Real-time Display** - Results shown immediately in themed UI
6. **Future: PDF Manipulation** - pdf-lib will process PDFs based on Gemini's analysis

## 🔧 Configuration

Edit `.env` file to customize:

```env
# Server port
PORT=3456

# Rate limiting (leave buffer from actual limits)
MAX_REQUESTS_PER_MINUTE=50
MAX_REQUESTS_PER_DAY=900

# File size limits
MAX_FILE_SIZE_MB=50
```

## 📋 Examples

### Analyzing a PDF
```javascript
const formData = new FormData();
formData.append('pdf', pdfFile);

const response = await fetch('http://localhost:3456/api/analyze', {
  method: 'POST',
  body: formData
});

const analysis = await response.json();
// {
//   type: "form",
//   pages: 3,
//   hasFormFields: true,yo
//   formFields: [...],
//   summary: "Tax form W-9 with fillable fields"
// }
```

### Filling a Form
```javascript
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('data', JSON.stringify({
  name: "John Doe",
  email: "john@example.com",
  ssn: "123-45-6789"
}));

const response = await fetch('http://localhost:3456/api/fill', {
  method: 'POST',
  body: formData
});

const filledPDF = await response.blob();
// Download or display the filled PDF
```

## 🔒 Privacy & Security

- **Local Processing** - PDFs are processed locally on your machine
- **No Cloud Storage** - Files are never stored in the cloud
- **Secure AI Calls** - Only AI analysis goes to Google's servers
- **Automatic Cleanup** - Temporary files are deleted immediately
- **Google Auth** - Uses official Google authentication

## 🤝 Contributing

Contributions are welcome! Check out [FEATURES.md](FEATURES.md) for the roadmap.

### Priority Features Needed

- [x] **PDF Form Filling** - ✅ DONE - Full implementation with pdf-lib
- [x] **Password Support** - ✅ DONE - Complete support for encrypted PDFs
- [x] **Bulk CSV Processing** - ✅ DONE - Template-based bulk filling from spreadsheets
- [x] **Profile System** - ✅ DONE - Secure profile storage with encryption
- [x] **Full Text Extraction** - ✅ DONE - Complete text extraction beyond form fields
- [ ] **Export to CSV** - Extract data from multiple PDFs to spreadsheet
- [ ] **OCR Support** - Extract text from scanned PDFs

### Future Enhancements

- [ ] **Multi-AI Support** - Add providers like Anthropic Claude, OpenAI GPT-4
- [ ] **PDF Operations** - Merge, split, rotate, reorder pages
- [ ] **Template Creation** - Design custom form templates
- [ ] **Browser Extension** - Chrome/Firefox extension for web PDFs
- [ ] **Batch Queue** - Background processing with progress tracking
- [ ] **Format Conversion** - PDF to Word, Excel, PowerPoint, etc.
- [ ] **OCR Enhancement** - Better handling of scanned documents
- [ ] **Digital Signatures** - Add signature fields and validation

See [MERGER_PROPOSAL.md](MERGER_PROPOSAL.md) for plans to unify with the MCP/Claude Desktop version.

## 📄 License

MIT License - Use freely for personal and commercial projects!

## 🙏 Acknowledgments

- Google Gemini team for the generous free tier
- Ben Vargas for the [ai-sdk-provider-gemini-cli](https://github.com/ben-vargas/ai-sdk-provider-gemini-cli) package that enables AI SDK integration
- pdf-lib for PDF manipulation
- The open source community

## ⚠️ Disclaimer

This tool uses Google's Gemini AI service. Please review Google's terms of service and ensure your usage complies with their policies. The free tier limits are subject to change.

## 🆘 Troubleshooting

### Gemini CLI not found
- Ensure Gemini CLI is installed and in your PATH
- Run `which gemini` (macOS/Linux) or `where gemini` (Windows)
- Reinstall using the setup script

### Authentication issues
- Run `gemini auth login` to re-authenticate
- Check `gemini auth list` to verify login status

### Rate limiting
- The app automatically manages rate limits
- If you hit limits, wait a minute and try again
- Adjust limits in `.env` if needed

### PDF processing errors
- Ensure PDFs are not corrupted
- Check file size (max 50MB by default)
- Try with a simpler PDF first

---

**Built with ❤️ to make AI-powered PDF processing accessible to everyone!**
