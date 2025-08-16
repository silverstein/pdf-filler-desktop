require('dotenv').config(); // Load .env file

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { PDFDocument, rgb } = require('pdf-lib');
const GeminiSimple = require('./gemini-simple');

const app = express();
const PORT = process.env.PORT || 3456;

// Use simplified Gemini approach - just pass file paths
const gemini = new GeminiSimple();
console.log('Using simplified Gemini with direct file access');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads
// Determine upload directory based on environment
const getUploadDir = () => {
  // Check if running in Electron
  if (process.versions && process.versions.electron) {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'uploads');
  }
  // Fallback for development/standalone server
  return path.join(__dirname, '../uploads');
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = getUploadDir();
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const geminiAvailable = await gemini.checkGeminiCLI();
  res.json({
    status: 'ok',
    geminiCLI: geminiAvailable ? 'available' : 'not found',
    message: geminiAvailable ? 
      'Ready to process PDFs!' : 
      'Please install Gemini CLI: https://github.com/google/generative-ai-docs'
  });
});

// ============================================
// NEW: Local file path endpoints (for desktop app)
// ============================================

// Helper function to copy external files to temp directory
async function ensureFileInWorkspace(filePath) {
  const projectRoot = path.join(__dirname, '..');
  
  // Check if file is already within project directory
  if (filePath.startsWith(projectRoot)) {
    return filePath; // Already in workspace
  }
  
  // Copy to temp directory
  const tempDir = path.join(projectRoot, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  
  const fileName = path.basename(filePath);
  const tempPath = path.join(tempDir, `${Date.now()}-${fileName}`);
  
  await fs.copyFile(filePath, tempPath);
  
  // Schedule cleanup after 5 minutes
  setTimeout(async () => {
    try {
      await fs.unlink(tempPath);
    } catch (err) {
      // File might already be deleted
    }
  }, 5 * 60 * 1000);
  
  return tempPath;
}

// Analyze PDF from local path
app.post('/api/analyze-local', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Ensure file is accessible to Gemini
    const workspacePath = await ensureFileInWorkspace(filePath);
    
    const analysis = await gemini.analyzePDF(workspacePath);
    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract data from local PDF
app.post('/api/extract-local', async (req, res) => {
  try {
    const { filePath, template } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Ensure file is accessible to Gemini
    const workspacePath = await ensureFileInWorkspace(filePath);
    
    const data = await gemini.extractPDFData(workspacePath, template);
    res.json(data);
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fill PDF from local path
app.post('/api/fill-local', async (req, res) => {
  try {
    const { filePath, fillData, outputPath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get fill instructions from Gemini
    const instructions = await gemini.generateFillInstructions(filePath, fillData);
    
    // Load the PDF
    const existingPdfBytes = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Apply instructions
    for (const instruction of instructions) {
      try {
        if (instruction.type === 'text') {
          const field = form.getTextField(instruction.field);
          field.setText(instruction.value);
        } else if (instruction.type === 'checkbox') {
          const field = form.getCheckBox(instruction.field);
          if (instruction.value) {
            field.check();
          } else {
            field.uncheck();
          }
        }
      } catch (fieldError) {
        console.error(`Failed to fill field ${instruction.field}:`, fieldError.message);
      }
    }
    
    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();
    
    // If outputPath provided, save there. Otherwise return bytes
    if (outputPath) {
      await fs.writeFile(outputPath, filledPdfBytes);
      res.json({ 
        success: true, 
        message: 'PDF filled successfully',
        outputPath
      });
    } else {
      // Send as download
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="filled-form.pdf"'
      });
      res.send(Buffer.from(filledPdfBytes));
    }
  } catch (error) {
    console.error('Fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate PDF from local path
app.post('/api/validate-local', async (req, res) => {
  try {
    const { filePath, requiredFields } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const validation = await gemini.validatePDFForm(filePath, requiredFields);
    res.json(validation);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEGACY: Upload-based endpoints (keeping for now)
// ============================================

// Analyze PDF endpoint
app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const analysis = await gemini.analyzePDF(req.file.path);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract data from PDF
app.post('/api/extract', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const template = req.body.template ? JSON.parse(req.body.template) : null;
    const data = await gemini.extractPDFData(req.file.path, template);
    
    // Clean up
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json(data);
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fill PDF form
app.post('/api/fill', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const fillData = JSON.parse(req.body.data || '{}');
    
    // Get fill instructions from Gemini
    const instructions = await gemini.generateFillInstructions(req.file.path, fillData);
    
    // Load the PDF
    const existingPdfBytes = await fs.readFile(req.file.path);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Apply instructions
    for (const instruction of instructions) {
      try {
        if (instruction.type === 'text') {
          const field = form.getTextField(instruction.field);
          field.setText(instruction.value);
        } else if (instruction.type === 'checkbox') {
          const field = form.getCheckBox(instruction.field);
          if (instruction.value) {
            field.check();
          } else {
            field.uncheck();
          }
        } else if (instruction.type === 'dropdown') {
          const field = form.getDropdown(instruction.field);
          field.select(instruction.value);
        } else if (instruction.type === 'radio') {
          const field = form.getRadioGroup(instruction.field);
          field.select(instruction.value);
        }
      } catch (fieldError) {
        console.warn(`Failed to fill field ${instruction.field}:`, fieldError.message);
      }
    }
    
    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();
    
    // Clean up original
    await fs.unlink(req.file.path).catch(() => {});
    
    // Send filled PDF
    res.contentType('application/pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare two PDFs
app.post('/api/compare', upload.array('pdfs', 2), async (req, res) => {
  try {
    if (!req.files || req.files.length !== 2) {
      return res.status(400).json({ error: 'Please provide exactly 2 PDF files' });
    }

    const comparison = await gemini.compareDocuments(
      req.files[0].path,
      req.files[1].path
    );
    
    // Clean up
    for (const file of req.files) {
      await fs.unlink(file.path).catch(() => {});
    }
    
    res.json(comparison);
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate PDF form
app.post('/api/validate', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const requiredFields = req.body.requiredFields ? 
      JSON.parse(req.body.requiredFields) : [];
    
    const validation = await gemini.validatePDFForm(req.file.path, requiredFields);
    
    // Clean up
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json(validation);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk process PDFs from CSV
app.post('/api/bulk', upload.fields([
  { name: 'template', maxCount: 1 },
  { name: 'csv', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files.template || !req.files.csv) {
      return res.status(400).json({ error: 'Please provide both template PDF and CSV file' });
    }

    const csvPath = req.files.csv[0].path;
    const templatePath = req.files.template[0].path;
    
    // Read CSV (simple implementation - could use csv-parse for production)
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = values[index];
      });
      
      try {
        // Get fill instructions for this row
        const instructions = await gemini.generateFillInstructions(templatePath, rowData);
        
        // Load template
        const pdfBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();
        
        // Apply instructions
        for (const inst of instructions) {
          try {
            if (inst.type === 'text') {
              form.getTextField(inst.field).setText(inst.value);
            }
            // Add other field types as needed
          } catch (e) {
            console.warn(`Field error: ${e.message}`);
          }
        }
        
        // Save filled PDF
        const filledBytes = await pdfDoc.save();
        const outputPath = path.join(getUploadDir(), `filled-${i}-${Date.now()}.pdf`);
        await fs.writeFile(outputPath, filledBytes);
        
        results.push({
          row: i,
          status: 'success',
          file: outputPath
        });
      } catch (error) {
        results.push({
          row: i,
          status: 'error',
          error: error.message
        });
      }
    }
    
    // Clean up
    await fs.unlink(csvPath).catch(() => {});
    await fs.unlink(templatePath).catch(() => {});
    
    res.json({ results });
  } catch (error) {
    console.error('Bulk processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PDF Filler Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  - GET  /api/health     - Check system status');
  console.log('  - POST /api/analyze    - Analyze PDF structure');
  console.log('  - POST /api/extract    - Extract data from PDF');
  console.log('  - POST /api/fill       - Fill PDF form');
  console.log('  - POST /api/compare    - Compare two PDFs');
  console.log('  - POST /api/validate   - Validate PDF form');
  console.log('  - POST /api/bulk       - Bulk process PDFs from CSV');
});

module.exports = app;