# Implementation Plan: PDF Form Filling Features

## Overview
This document outlines the implementation plan for adding actual PDF manipulation capabilities to PDF Filler Desktop, achieving feature parity with pdf-filler-simple.

**With Claude Code, all phases can be completed in a single day.**

## How to Use This Document
1. Check off completed tasks with [x]
2. Work through phases sequentially
3. Commit after each checkbox update
4. Any Claude session can pick up where the last one left off

## Phase 1: Core PDF Manipulation
**Goal**: Add ability to actually fill and save PDFs

### 1.1 Add PDF Libraries
- [ ] Install pdf-lib for form manipulation
- [ ] Install pdf-parse for better text extraction
- [ ] Test basic PDF reading/writing in isolation

### 1.2 Create PDF Service Module (`src/services/pdf-service.js`)
- [ ] Create service class for PDF operations
- [ ] Implement `readFormFields(pdfPath)` - get all form fields
- [ ] Implement `fillFormFields(pdfPath, data)` - fill fields with data
- [ ] Implement `saveFilledPDF(pdfDoc, outputPath)` - save modified PDF
- [ ] Add password support to all methods
- [ ] Add error handling for corrupted/invalid PDFs

### 1.3 Update Server Endpoints
- [ ] Update `/api/fill-local` to actually fill PDFs
- [ ] Add `/api/read-fields-local` for form field discovery
- [ ] Add password parameter to all endpoints
- [ ] Return filled PDF as download or save to specified path

### 1.4 Update UI for Form Filling
- [ ] Replace `prompt()` with proper modal dialog
- [ ] Create form field mapping interface
- [ ] Add "Fill Form" button that shows field mapping UI
- [ ] Show preview of fields to be filled
- [ ] Add password prompt for protected PDFs
- [ ] Add save location picker

### 1.5 Testing
- [ ] Test with W-9 form (key success metric)
- [ ] Test with password-protected PDF
- [ ] Test with complex multi-page forms
- [ ] Test with various field types (text, checkbox, dropdown)

## Phase 2: Bulk Operations
**Goal**: Process multiple PDFs from CSV data

### 2.1 CSV Processing
- [ ] Create CSV parser service (`src/services/csv-service.js`)
- [ ] Implement CSV upload endpoint
- [ ] Map CSV columns to PDF fields
- [ ] Handle different CSV formats/delimiters

### 2.2 Bulk Fill Implementation
- [ ] Create `/api/bulk-fill` endpoint
- [ ] Process PDFs in sequence (avoid rate limits)
- [ ] Generate unique filenames from CSV data
- [ ] Create progress tracking system
- [ ] Handle errors gracefully (don't stop entire batch)

### 2.3 Bulk UI
- [ ] Add "Bulk Fill" tab to UI
- [ ] CSV upload interface
- [ ] Column mapping interface
- [ ] Progress bar for batch operations
- [ ] Download all as ZIP option

## Phase 3: Profile System
**Goal**: Save and reuse common form data

### 3.1 Profile Storage
- [ ] Create profile service (`src/services/profile-service.js`)
- [ ] Store profiles in `~/.pdf-filler/profiles/`
- [ ] Implement CRUD operations for profiles
- [ ] Encrypt sensitive data in profiles

### 3.2 Profile Management UI
- [ ] Add "Profiles" section to UI
- [ ] Create new profile from filled form
- [ ] Edit existing profiles
- [ ] Delete profiles
- [ ] Import/export profiles

### 3.3 Integration
- [ ] Add "Fill from Profile" option
- [ ] Quick profile selector in fill dialog
- [ ] Merge profile data with manual input

## Phase 4: Advanced Extraction
**Goal**: Extract full text and data beyond form fields

### 4.1 Full Text Extraction
- [ ] Implement `extractFullText(pdfPath)` method
- [ ] Add OCR support for scanned PDFs (using Gemini's vision)
- [ ] Extract tables and structured data
- [ ] Convert to markdown format

### 4.2 Export Features
- [ ] Create `/api/extract-to-csv` endpoint
- [ ] Export multiple PDFs to single CSV
- [ ] Customizable export templates
- [ ] Support different output formats (JSON, CSV, Excel)

### 4.3 UI Updates
- [ ] Add "Extract Text" option
- [ ] Show extracted text in formatted view
- [ ] Copy to clipboard functionality
- [ ] Export options dropdown

## Phase 5: UI/UX Improvements
**Goal**: Polish the user experience

### 5.1 Recent Files Sidebar
- [ ] Design responsive sidebar layout
- [ ] Show file thumbnails if possible
- [ ] Quick actions (analyze, fill, delete)
- [ ] Search/filter recent files
- [ ] Clear history option

### 5.2 Visual PDF Preview
- [ ] Integrate PDF.js for in-app preview
- [ ] Show form fields highlighted
- [ ] Before/after comparison for filled forms
- [ ] Page navigation for multi-page PDFs

### 5.3 Better Error Handling
- [ ] User-friendly error messages
- [ ] Retry mechanisms
- [ ] Error logging for debugging
- [ ] Help documentation links

## Phase 6: Testing & Polish
**Goal**: Ensure production readiness

### 6.1 Comprehensive Testing
- [ ] Unit tests for all services
- [ ] Integration tests for endpoints
- [ ] E2E tests for critical user flows
- [ ] Performance testing with large PDFs

### 6.2 Build & Distribution
- [ ] Update electron-builder config
- [ ] Create installers for Mac/Windows/Linux
- [ ] Code signing setup (if budget allows)
- [ ] Auto-update mechanism

### 6.3 Documentation
- [ ] Update README with new features
- [ ] Create user guide with screenshots
- [ ] API documentation for developers
- [ ] Troubleshooting guide

## Technical Decisions

### Architecture Changes
```
src/
├── services/               # NEW: Business logic layer
│   ├── pdf-service.js     # PDF manipulation
│   ├── csv-service.js     # CSV processing
│   ├── profile-service.js # Profile management
│   └── export-service.js  # Data export
├── electron.js            # Main process
├── server.js              # API server
├── gemini-simple.js       # AI integration
└── ui/                    # NEW: UI components
    ├── modals/
    │   ├── fill-form.js
    │   ├── bulk-fill.js
    │   └── profiles.js
    └── components/
        ├── recent-files.js
        └── pdf-preview.js
```

### Key Dependencies to Add
```json
{
  "dependencies": {
    "pdf-lib": "^1.17.1",      // PDF form manipulation
    "pdf-parse": "^1.1.1",      // Text extraction  
    "csv-parse": "^5.5.0",      // CSV parsing
    "archiver": "^6.0.0",       // ZIP creation for bulk
    "pdfjs-dist": "^3.11.0",    // PDF preview
    "bcryptjs": "^2.4.3"        // Profile encryption
  }
}
```

### File Structure for New Features
```
~/.pdf-filler/
├── profiles/
│   ├── work.json
│   ├── personal.json
│   └── taxes.json
├── templates/
│   └── export-templates/
└── logs/
    └── error.log
```

## Success Metrics

### Must Have (MVP)
- [x] Can analyze PDFs (DONE)
- [ ] Can fill a W-9 form and save it
- [ ] Can handle password-protected PDFs
- [ ] Can bulk fill from CSV
- [ ] Can save/load profiles

### Should Have
- [ ] Visual PDF preview
- [ ] Recent files sidebar
- [ ] Export to CSV
- [ ] Full text extraction
- [ ] Better error messages

### Nice to Have
- [ ] OCR for scanned PDFs
- [ ] Auto-update system
- [ ] Cloud sync for profiles
- [ ] Keyboard shortcuts
- [ ] Drag-drop to system tray

## Risk Mitigation

### Technical Risks
1. **PDF Complexity**: Some PDFs have non-standard forms
   - Mitigation: Test with diverse PDF samples
   - Fallback: Show clear error messages

2. **Performance**: Large PDFs might be slow
   - Mitigation: Add progress indicators
   - Optimization: Process in chunks

3. **Security**: Handling sensitive documents
   - Mitigation: Never upload, process locally
   - Encryption: Secure profile storage

### User Experience Risks
1. **Learning Curve**: Complex features might confuse users
   - Mitigation: Progressive disclosure
   - Help: In-app tutorials

2. **Data Loss**: Users might overwrite important PDFs
   - Mitigation: Always save as new file
   - Backup: Keep original unchanged

## Development Workflow

### Branch Strategy
```
main
├── feature/pdf-manipulation     # Phase 1
├── feature/bulk-operations      # Phase 2
├── feature/profile-system       # Phase 3
├── feature/advanced-extraction  # Phase 4
└── feature/ui-improvements      # Phase 5
```

### Commit Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code restructuring
- `test:` Adding tests
- `chore:` Maintenance

### Testing Each Phase
1. Local testing with sample PDFs
2. Create test suite for new features
3. User testing with real documents
4. Performance profiling
5. Security review

## Next Steps

1. **Start here**: Create feature branch for Phase 1
2. **Then**: Install pdf-lib and create basic service
3. **Continue**: Work through phases sequentially
4. **Goal**: Complete all phases in current session

## Notes for Future Claude Sessions

### Current State (as of last update)
- ✅ PDF analysis working with Gemini
- ✅ Native file selection implemented
- ✅ MCP filesystem configured
- ✅ Themes and UI working
- ❌ Cannot actually fill PDFs yet
- ❌ No password support
- ❌ No bulk operations
- ❌ No profile system

### Where to Find Things
- Main logic: `src/server.js`
- Gemini integration: `src/gemini-simple.js`
- UI: `public/index.html`
- Themes: `public/themes.css`
- Electron: `src/electron.js`

### Environment Setup
```bash
# Install dependencies
npm install

# Start development
npm start

# Test with a PDF
# Use the W-9 form from IRS website as standard test
```

### Common Issues & Solutions
1. **Port 3456 in use**: Kill existing process
2. **Gemini auth expired**: Re-authenticate in app
3. **MCP not working**: Check `gemini-cli-local/.gemini/mcp_servers.json`

---

**Last Updated**: [This will be auto-updated with each change]
**Current Phase**: Planning
**Next Action**: Create feature branch and start Phase 1.1