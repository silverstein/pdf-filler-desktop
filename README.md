# PDF Filler - Free AI-Powered PDF Processing

Transform your PDFs with the power of Google's Gemini AI - **completely free** using the generous Gemini CLI free tier!

## ✨ Features

- 📄 **Analyze PDFs** - Extract structure, form fields, and content
- 📊 **Extract Data** - Convert PDF content to structured JSON
- ✏️ **Fill Forms** - Automatically fill PDF forms with your data
- ✅ **Validate Forms** - Check for missing required fields
- 🔄 **Bulk Processing** - Process multiple PDFs from CSV data
- 📈 **Compare Documents** - Identify differences between PDFs
- 🔐 **Password Support** - Handle encrypted PDFs
- 🖼️ **OCR Support** - Extract text from scanned documents

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Gemini CLI** - Google's command-line AI tool
3. **Google Account** - For Gemini authentication

### Installation

```bash
# Clone the repository
git clone https://github.com/silverstein/pdf-filler-desktop
cd pdf-filler-desktop

# Run the setup wizard
npm run setup
```

The setup wizard will:
- Check for Gemini CLI installation
- Guide you through authentication
- Install dependencies
- Create configuration files
- Optionally create desktop shortcuts

### Installing Gemini CLI

#### macOS/Linux:
```bash
curl -sSL https://gemini.google.com/cli/install.sh | bash
```

#### Windows:
Download the installer from [Gemini CLI Releases](https://github.com/google/generative-ai-docs)

#### Authentication:
```bash
# Login to your Google account
gemini auth login

# Verify authentication
gemini auth list
```

## 🎮 Usage

### Option 1: Web Interface

```bash
npm start
# Open http://localhost:3456 in your browser
```

### Option 2: Desktop Application

```bash
npm run electron
```

The desktop app provides:
- System tray integration
- Drag & drop PDF processing
- Native file dialogs
- Offline-capable interface

### Option 3: API Endpoints

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
gemini-pdf-filler/
├── src/
│   ├── server.js         # Express API server
│   ├── gemini-bridge.js  # Gemini CLI integration
│   └── electron.js       # Desktop app wrapper
├── public/
│   └── index.html        # Web interface
├── scripts/
│   └── setup.js          # Installation wizard
└── package.json
```

### How It Works

1. **PDF Upload** - User uploads PDF via web UI or desktop app
2. **Gemini Processing** - PDF is sent to Gemini CLI with specific prompts
3. **AI Analysis** - Gemini's 2.5 Pro model analyzes the PDF with its native PDF understanding
4. **Structured Response** - Gemini returns structured JSON data
5. **PDF Manipulation** - pdf-lib processes the PDF based on Gemini's analysis
6. **Result Delivery** - Processed PDF or data returned to user

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

Contributions are welcome! This project demonstrates how to democratize AI tools using free tiers.

### Ideas for Enhancement

- [ ] Add support for more AI providers (Anthropic, OpenAI)
- [ ] Implement PDF merging and splitting
- [ ] Add form template creation
- [ ] Create browser extension
- [ ] Add batch processing queue
- [ ] Implement PDF to other format conversions

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