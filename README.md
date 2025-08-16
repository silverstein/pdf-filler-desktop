# PDF Filler Desktop - Free AI-Powered PDF Processing

A native desktop application for PDF form filling and analysis, powered by Google's Gemini AI - **completely free** using Gemini's generous free tier. No API keys required!

## ✨ Current Features

- 🖥️ **Native Desktop App** - System tray integration, works offline
- 📂 **Native File Selection** - No uploads needed, works with files anywhere on your system
- 📄 **Analyze PDFs** - Extract structure, form fields, and content
- 📊 **Extract Data** - Convert PDF content to structured JSON
- ✅ **Validate Forms** - Check for missing required fields
- 🎨 **Multiple Themes** - Dark, Light, Ocean, Forest, and more
- 📝 **Recent Files** - Quick access to recently processed PDFs
- 🔒 **Privacy First** - All processing happens locally

## 🚧 Coming Soon

- ✏️ **Fill Forms** - Actually write data back to PDFs
- 🔐 **Password Support** - Handle encrypted PDFs
- 🔄 **Bulk Processing** - Process multiple PDFs from CSV data
- 👤 **Profile System** - Save and reuse common form data
- 📤 **Export to CSV** - Extract data from multiple PDFs to spreadsheet

## 🚀 Quick Start

### Prerequisites

1. **Google Account** - For Gemini authentication (OAuth)
2. **macOS, Windows, or Linux** - Cross-platform support
3. **Node.js** (v18+) - Only needed for development

### Installation

```bash
# Clone the repository
git clone https://github.com/silverstein/pdf-filler-desktop
cd pdf-filler-desktop

# Install dependencies
npm install

# Start the app
npm start
```

The app will:
- Install a local Gemini CLI instance automatically
- Guide you through Google OAuth authentication
- Create a system tray icon for easy access
- Open the main window with the UI

### First-Time Authentication

1. Click "Sign in with Google" in the app
2. Complete OAuth in your browser
3. Return to the app - you're ready to go!

No API keys needed - just your Google account!

## 🎮 Usage

### Desktop Application (Recommended)

```bash
npm start
```

The desktop app provides:
- 📁 **Native file selection** - Click or drag to select PDFs from anywhere
- 🔧 **System tray integration** - Runs in background, always accessible
- 🎨 **Beautiful themes** - Multiple color schemes to choose from
- 📊 **Recent files sidebar** - Quick access to previously processed PDFs
- ⚡ **Fast processing** - Direct file access, no uploads needed

### Development Mode

```bash
# Run with DevTools open
DEBUG=1 npm start
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
//   hasFormFields: true,
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

- [ ] **PDF Form Filling** - Actually write data back to PDFs using pdf-lib
- [ ] **Password Support** - Handle encrypted PDFs
- [ ] **Bulk CSV Processing** - Fill multiple PDFs from spreadsheet data
- [ ] **Profile System** - Save and reuse common form data
- [ ] **Full Text Extraction** - Get all text, not just form fields

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