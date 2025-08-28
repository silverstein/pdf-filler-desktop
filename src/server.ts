import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { promises as fs } from 'fs';
import { PDFDocument } from 'pdf-lib';
import { GeminiCLIService } from './services/gemini-cli.service';
import { PDFService } from './services/pdf-service';
import { CSVService } from './services/csv-service';
import { ProfileService } from './services/profile-service';
import { PDFIntelligenceService } from './services/pdf-intelligence.service';

// Type definitions for request bodies
interface AnalyzeLocalRequest {
  filePath: string;
}

interface ExtractLocalRequest {
  filePath: string;
  template?: any;
}

interface FillLocalRequest {
  filePath: string;
  fillData?: Record<string, any>;
  outputPath?: string;
  password?: string;
}

interface ValidateLocalRequest {
  filePath: string;
  requiredFields?: string[];
}

interface ReadFieldsLocalRequest {
  filePath: string;
  password?: string;
}

interface FillPDFLocalRequest {
  filePath: string;
  data: Record<string, any>;
  outputPath: string;
  password?: string;
}

interface ValidatePDFLocalRequest {
  filePath: string;
  requiredFields: string[];
  password?: string;
}

interface ExtractTextLocalRequest {
  filePath: string;
  password?: string;
}

interface BulkFillLocalRequest {
  templatePath: string;
  csvPath: string;
  outputDir: string;
  options?: {
    namingPattern?: string;
    password?: string;
    maxConcurrent?: number;
    overwriteExisting?: boolean;
  };
}

interface ProfileCreateRequest {
  name: string;
  data: Record<string, any>;
  options?: {
    description?: string;
    tags?: string[];
    isDefault?: boolean;
    isTemplate?: boolean;
  };
}

interface ProfileUpdateRequest {
  data: Record<string, any>;
  options?: {
    description?: string;
    tags?: string[];
    isDefault?: boolean;
  };
}

interface ProfileMergeRequest {
  profile1Name: string;
  profile2Name: string;
  newProfileName: string;
  mergeOptions?: {
    strategy?: 'prefer_first' | 'prefer_second' | 'combine';
  };
}

interface FillWithProfileRequest {
  filePath: string;
  profileName: string;
  outputPath?: string;
  password?: string;
  overrideData?: Record<string, any>;
}

interface BulkFillResult {
  total: number;
  successful: number;
  failed: number;
  files: Array<{
    row: number;
    fileName?: string;
    outputPath?: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
  errors: Array<{
    row: number;
    error: string;
    status: 'failed';
  }>;
  processingTime?: string;
  averageTimePerFile?: string;
  successRate?: string;
}

const app = express();
const PORT = process.env.PORT || 3456;

// Use simplified Gemini approach - just pass file paths
const gemini = new GeminiCLIService();
const pdfService = new PDFService();
const csvService = new CSVService();
const profileService = new ProfileService();
const pdfIntelligence = new PDFIntelligenceService();
console.log('Using simplified Gemini with direct file access');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads
// Determine upload directory based on environment
const getUploadDir = (): string => {
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
app.get('/api/health', async (req: Request, res: Response) => {
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
// NEW: PDF Intelligence Endpoints
// ============================================

// Get quick intelligence about a PDF
app.post('/api/intelligence-local', async (req: Request<{}, {}, { filePath: string }>, res: Response) => {
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
    
    // Get intelligence analysis
    const intelligence = await pdfIntelligence.getQuickIntelligence(filePath);
    res.json(intelligence);
  } catch (error: any) {
    console.error('Intelligence analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Classify document type
app.post('/api/classify-local', async (req: Request<{}, {}, { filePath: string }>, res: Response) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    const documentType = await pdfIntelligence.classifyDocument(filePath);
    res.json({ documentType });
  } catch (error: any) {
    console.error('Classification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check document completeness
app.post('/api/completeness-local', async (req: Request<{}, {}, { filePath: string }>, res: Response) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    const completeness = await pdfIntelligence.validateCompleteness(filePath);
    res.json(completeness);
  } catch (error: any) {
    console.error('Completeness check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEW: Local file path endpoints (for desktop app)
// ============================================

// Helper function to copy external files to temp directory
async function ensureFileInWorkspace(filePath: string): Promise<string> {
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
app.post('/api/analyze-local', async (req: Request<{}, {}, AnalyzeLocalRequest>, res: Response) => {
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
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract data from local PDF
app.post('/api/extract-local', async (req: Request<{}, {}, ExtractLocalRequest>, res: Response) => {
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
    
    const data = await gemini.extractPDFData({ pdfPath: workspacePath, template });
    res.json(data);
  } catch (error: any) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fill PDF from local path (Enhanced with PDFService)
app.post('/api/fill-local', async (req: Request<{}, {}, FillLocalRequest>, res: Response) => {
  try {
    const { filePath, fillData, outputPath, password } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // If fillData is provided, use PDFService for direct filling
    if (fillData && typeof fillData === 'object') {
      try {
        const pdfDoc = await pdfService.fillFormFields(filePath, fillData, password || null);
        const filledPdfBytes = await pdfDoc.save();
        
        if (outputPath) {
          await fs.writeFile(outputPath, filledPdfBytes);
          res.json({ 
            success: true, 
            message: 'PDF filled successfully with PDFService',
            outputPath
          });
        } else {
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="filled-form.pdf"'
          });
          res.send(Buffer.from(filledPdfBytes));
        }
        return;
      } catch (pdfServiceError: any) {
        console.warn('PDFService filling failed, falling back to Gemini:', pdfServiceError.message);
      }
    }
    
    // Fallback to original Gemini-based approach
    const instructions = await gemini.generateFillInstructions(filePath, fillData || {});
    
    // Load the PDF
    const existingPdfBytes = await fs.readFile(filePath);
    const loadOptions: any = {};
    if (password) {
      loadOptions.password = password;
    }
    const pdfDoc = await PDFDocument.load(existingPdfBytes, loadOptions);
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Apply instructions
    for (const instruction of instructions) {
      try {
        if (instruction.type === 'text') {
          const field = form.getTextField(instruction.field);
          field.setText(String(instruction.value));
        } else if (instruction.type === 'checkbox') {
          const field = form.getCheckBox(instruction.field);
          if (String(instruction.value) === 'true' || instruction.value === true) {
            field.check();
          } else {
            field.uncheck();
          }
        }
      } catch (fieldError: any) {
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
        message: 'PDF filled successfully with Gemini',
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
  } catch (error: any) {
    console.error('Fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate PDF from local path
app.post('/api/validate-local', async (req: Request<{}, {}, ValidateLocalRequest>, res: Response) => {
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
  } catch (error: any) {
    console.error('Validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEW: PDFService endpoints for direct PDF manipulation
// ============================================

// Read form fields from a PDF
app.post('/api/read-fields-local', async (req: Request<{}, {}, ReadFieldsLocalRequest>, res: Response) => {
  try {
    const { filePath, password } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    const fields = await pdfService.readFormFields(filePath, password || null);
    res.json({ fields });
  } catch (error: any) {
    console.error('Read fields error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fill a PDF with data and save it
app.post('/api/fill-pdf-local', async (req: Request<{}, {}, FillPDFLocalRequest>, res: Response) => {
  try {
    const { filePath, data, outputPath, password } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'No data provided or data is not an object' });
    }
    
    if (!outputPath) {
      return res.status(400).json({ error: 'No output path provided' });
    }
    
    // Fill the form fields
    const pdfDoc = await pdfService.fillFormFields(filePath, data, password || null);
    
    // Save the filled PDF
    const savedPath = await pdfService.saveFilledPDF(pdfDoc, outputPath);
    
    res.json({ 
      success: true, 
      message: 'PDF filled successfully',
      outputPath: savedPath
    });
  } catch (error: any) {
    console.error('Fill PDF error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate required fields in a PDF
app.post('/api/validate-pdf-local', async (req: Request<{}, {}, ValidatePDFLocalRequest>, res: Response) => {
  try {
    const { filePath, requiredFields, password } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    if (!requiredFields || !Array.isArray(requiredFields)) {
      return res.status(400).json({ error: 'Required fields must be an array' });
    }
    
    const validation = await pdfService.validateForm(filePath, requiredFields, password || null);
    res.json(validation);
  } catch (error: any) {
    console.error('Validate PDF error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract full text from a PDF
app.post('/api/extract-text-local', async (req: Request<{}, {}, ExtractTextLocalRequest>, res: Response) => {
  try {
    const { filePath, password } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    const textData = await pdfService.extractFullText(filePath, password || null);
    res.json(textData);
  } catch (error: any) {
    console.error('Extract text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NEW: Profile Management Endpoints
// ============================================

// List all profiles
app.get('/api/profiles', async (req: Request, res: Response) => {
  try {
    const { tags, isDefault, isTemplate } = req.query;
    
    const filters: any = {};
    if (tags) {
      filters.tags = Array.isArray(tags) ? tags : (tags as string).split(',').map((t: string) => t.trim());
    }
    if (isDefault !== undefined) {
      filters.isDefault = isDefault === 'true';
    }
    if (isTemplate !== undefined) {
      filters.isTemplate = isTemplate === 'true';
    }
    
    const profiles = await profileService.listProfiles(filters);
    res.json({ profiles });
  } catch (error: any) {
    console.error('List profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific profile
app.get('/api/profiles/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    const profile = await profileService.getProfile(name);
    if (!profile) {
      return res.status(404).json({ error: `Profile '${name}' not found` });
    }
    
    res.json(profile);
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new profile
app.post('/api/profiles', async (req: Request<{}, {}, ProfileCreateRequest>, res: Response) => {
  try {
    const { name, data, options = {} } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Profile name is required' });
    }
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Profile data is required and must be an object' });
    }
    
    const profile = await profileService.createProfile(name, data, options);
    res.status(201).json(profile);
  } catch (error: any) {
    console.error('Create profile error:', error);
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message });
    } else if (error.message.includes('validation')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update profile
app.put('/api/profiles/:name', async (req: Request<{ name: string }, {}, ProfileUpdateRequest>, res: Response) => {
  try {
    const { name } = req.params;
    const { data, options = {} } = req.body;
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Profile data is required and must be an object' });
    }
    
    const profile = await profileService.updateProfile(name, data, options);
    res.json(profile);
  } catch (error: any) {
    console.error('Update profile error:', error);
    if (error.message.includes('does not exist')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('validation')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Delete profile
app.delete('/api/profiles/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    const deleted = await profileService.deleteProfile(name);
    if (!deleted) {
      return res.status(404).json({ error: `Profile '${name}' not found` });
    }
    
    res.json({ success: true, message: `Profile '${name}' deleted successfully` });
  } catch (error: any) {
    console.error('Delete profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export profile
app.get('/api/profiles/:name/export', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { includeMetadata = 'true' } = req.query;
    
    // Create a temporary export file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    const exportPath = path.join(tempDir, `${name}_export_${timestamp}.json`);
    
    const finalPath = await profileService.exportProfile(
      name, 
      exportPath, 
      includeMetadata === 'true'
    );
    
    // Send file as download
    res.download(finalPath, `${name}_profile.json`, async (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up temporary file
      try {
        await fs.unlink(finalPath);
      } catch (cleanupError: any) {
        console.warn('Failed to cleanup export file:', cleanupError.message);
      }
    });
  } catch (error: any) {
    console.error('Export profile error:', error);
    if (error.message.includes('does not exist')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Import profile
app.post('/api/profiles/import', upload.single('profileFile'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No profile file provided' });
    }
    
    const { overwrite = 'false', rename = 'true' } = req.body;
    
    const options = {
      overwrite: overwrite === 'true',
      rename: rename === 'true'
    };
    
    const profile = await profileService.importProfile(req.file.path, options);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    res.status(201).json(profile);
  } catch (error: any) {
    console.error('Import profile error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message });
    } else if (error.message.includes('not found') || error.message.includes('Invalid')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Fill PDF using a profile
app.post('/api/fill-with-profile-local', async (req: Request<{}, {}, FillWithProfileRequest>, res: Response) => {
  try {
    const { filePath, profileName, outputPath, password, overrideData = {} } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file path provided' });
    }
    
    if (!profileName) {
      return res.status(400).json({ error: 'No profile name provided' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get profile data
    const profile = await profileService.getProfile(profileName);
    if (!profile) {
      return res.status(404).json({ error: `Profile '${profileName}' not found` });
    }
    
    // Merge profile data with any override data
    const fillData = { ...profile.data, ...overrideData };
    
    // Use PDFService for direct filling
    try {
      const pdfDoc = await pdfService.fillFormFields(filePath, fillData, password || null);
      const filledPdfBytes = await pdfDoc.save();
      
      if (outputPath) {
        await fs.writeFile(outputPath, filledPdfBytes);
        res.json({ 
          success: true, 
          message: `PDF filled successfully using profile '${profileName}'`,
          outputPath,
          profileUsed: profileName,
          fieldsUsed: Object.keys(fillData).length
        });
      } else {
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="filled-${profileName}.pdf"`
        });
        res.send(Buffer.from(filledPdfBytes));
      }
    } catch (pdfServiceError: any) {
      console.warn('PDFService filling failed, falling back to Gemini:', pdfServiceError.message);
      
      // Fallback to Gemini-based approach
      const instructions = await gemini.generateFillInstructions(filePath, fillData);
      
      const existingPdfBytes = await fs.readFile(filePath);
      const loadOptions: any = {};
      if (password) {
        loadOptions.password = password;
      }
      const pdfDoc = await PDFDocument.load(existingPdfBytes, loadOptions);
      
      const form = pdfDoc.getForm();
      
      for (const instruction of instructions) {
        try {
          if (instruction.type === 'text') {
            const field = form.getTextField(instruction.field);
            field.setText(String(instruction.value));
          } else if (instruction.type === 'checkbox') {
            const field = form.getCheckBox(instruction.field);
            if (instruction.value) {
              field.check();
            } else {
              field.uncheck();
            }
          }
        } catch (fieldError: any) {
          console.error(`Failed to fill field ${instruction.field}:`, fieldError.message);
        }
      }
      
      const filledPdfBytes = await pdfDoc.save();
      
      if (outputPath) {
        await fs.writeFile(outputPath, filledPdfBytes);
        res.json({ 
          success: true, 
          message: `PDF filled successfully using profile '${profileName}' (Gemini fallback)`,
          outputPath,
          profileUsed: profileName,
          fieldsUsed: Object.keys(fillData).length
        });
      } else {
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="filled-${profileName}.pdf"`
        });
        res.send(Buffer.from(filledPdfBytes));
      }
    }
  } catch (error: any) {
    console.error('Fill with profile error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ============================================
// BULK PROCESSING: Enhanced PDF Operations
// ============================================

// Bulk fill PDFs from CSV data
app.post('/api/bulk-fill-local', async (req: Request<{}, {}, BulkFillLocalRequest>, res: Response) => {
  try {
    const { templatePath, csvPath, outputDir, options = {} } = req.body;
    
    // Validate required parameters
    if (!templatePath) {
      return res.status(400).json({ error: 'No template PDF path provided' });
    }
    
    if (!csvPath) {
      return res.status(400).json({ error: 'No CSV data path provided' });
    }
    
    if (!outputDir) {
      return res.status(400).json({ error: 'No output directory provided' });
    }
    
    // Check if template file exists
    try {
      await fs.access(templatePath);
    } catch {
      return res.status(404).json({ error: 'Template PDF file not found' });
    }
    
    // Check if CSV file exists
    try {
      await fs.access(csvPath);
    } catch {
      return res.status(404).json({ error: 'CSV file not found' });
    }
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Parse CSV data
    let csvData: Record<string, any>[];
    try {
      csvData = await csvService.parseCSV(csvPath);
    } catch (csvError: any) {
      return res.status(400).json({ error: `Failed to parse CSV: ${csvError.message}` });
    }
    
    if (csvData.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or contains no data rows' });
    }
    
    // Set up processing options
    const {
      namingPattern = '{index}_filled.pdf', // Default naming pattern
      password = null, // PDF password if needed
      maxConcurrent = 3, // Limit concurrent processing
      overwriteExisting = false
    } = options;
    
    // Track progress and errors
    const results: BulkFillResult = {
      total: csvData.length,
      successful: 0,
      failed: 0,
      files: [],
      errors: []
    };
    
    // Rate limiting variables
    let processedCount = 0;
    const startTime = Date.now();
    
    // Process CSV rows in batches to avoid overwhelming the system
    const batchSize = Math.min(maxConcurrent, 5); // Max 5 concurrent operations
    
    for (let i = 0; i < csvData.length; i += batchSize) {
      const batch = csvData.slice(i, i + batchSize);
      const batchPromises = batch.map(async (rowData, batchIndex) => {
        const rowIndex = i + batchIndex;
        
        try {
          // Generate filename using naming pattern
          let fileName = namingPattern;
          
          // Replace placeholders in naming pattern
          fileName = fileName.replace('{index}', String(rowIndex + 1).padStart(3, '0'));
          fileName = fileName.replace('{row}', String(rowIndex + 1));
          
          // Replace any column values in the pattern
          for (const [key, value] of Object.entries(rowData)) {
            if (value && typeof value === 'string') {
              // Sanitize value for filename
              const sanitizedValue = String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
              fileName = fileName.replace(`{${key}}`, sanitizedValue);
            }
          }
          
          // Ensure .pdf extension
          if (!fileName.toLowerCase().endsWith('.pdf')) {
            fileName += '.pdf';
          }
          
          const outputPath = path.join(outputDir, fileName);
          
          // Check if file exists and overwrite is disabled
          if (!overwriteExisting) {
            try {
              await fs.access(outputPath);
              throw new Error(`File already exists: ${fileName}`);
            } catch (accessError: any) {
              // File doesn't exist, which is what we want
              if (accessError.code !== 'ENOENT') {
                throw accessError;
              }
            }
          }
          
          // Fill the PDF with row data
          const filledPdfDoc = await pdfService.fillFormFields(templatePath, rowData, password);
          
          // Save the filled PDF
          const savedPath = await pdfService.saveFilledPDF(filledPdfDoc, outputPath);
          
          results.successful++;
          results.files.push({
            row: rowIndex + 1,
            fileName: fileName,
            outputPath: savedPath,
            status: 'success'
          });
          
          console.log(`✓ Successfully filled PDF ${rowIndex + 1}/${csvData.length}: ${fileName}`);
          
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            row: rowIndex + 1,
            error: error.message,
            status: 'failed'
          });
          
          console.error(`✗ Failed to fill PDF ${rowIndex + 1}/${csvData.length}:`, error.message);
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      processedCount += batch.length;
      
      // Rate limiting: Add delay between batches to avoid overwhelming the system
      if (i + batchSize < csvData.length) {
        const elapsedTime = Date.now() - startTime;
        const avgTimePerItem = elapsedTime / processedCount;
        
        // If processing too fast, add a small delay
        if (avgTimePerItem < 100) { // Less than 100ms per item
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }
    
    // Calculate processing time
    const totalTime = Date.now() - startTime;
    
    // Generate summary
    results.processingTime = `${(totalTime / 1000).toFixed(2)} seconds`;
    results.averageTimePerFile = `${(totalTime / csvData.length).toFixed(0)} ms`;
    results.successRate = `${((results.successful / results.total) * 100).toFixed(1)}%`;
    
    console.log(`\n📊 Bulk fill completed:`);
    console.log(`   Total files: ${results.total}`);
    console.log(`   Successful: ${results.successful}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Success rate: ${results.successRate}`);
    console.log(`   Total time: ${results.processingTime}`);
    
    res.json(results);
    
  } catch (error: any) {
    console.error('Bulk fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LEGACY: Upload-based endpoints (keeping for now)
// ============================================

// Analyze PDF endpoint
app.post('/api/analyze', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const analysis = await gemini.analyzePDF(req.file.path);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json(analysis);
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract data from PDF
app.post('/api/extract', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const template = req.body.template ? JSON.parse(req.body.template) : null;
    const data = await gemini.extractPDFData({ pdfPath: req.file.path, template });
    
    // Clean up
    await fs.unlink(req.file.path).catch(() => {});
    
    res.json(data);
  } catch (error: any) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fill PDF form
app.post('/api/fill', upload.single('pdf'), async (req: Request, res: Response) => {
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
          field.setText(String(instruction.value));
        } else if (instruction.type === 'checkbox') {
          const field = form.getCheckBox(instruction.field);
          if (String(instruction.value) === 'true' || instruction.value === true) {
            field.check();
          } else {
            field.uncheck();
          }
        } else if (instruction.type === 'dropdown') {
          const field = form.getDropdown(instruction.field);
          field.select(String(instruction.value));
        } else if (instruction.type === 'radio') {
          const field = form.getRadioGroup(instruction.field);
          field.select(String(instruction.value));
        }
      } catch (fieldError: any) {
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
  } catch (error: any) {
    console.error('Fill error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare two PDFs
app.post('/api/compare', upload.array('pdfs', 2), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length !== 2) {
      return res.status(400).json({ error: 'Please provide exactly 2 PDF files' });
    }

    // Extract data from both PDFs
    const [pdf1Data, pdf2Data] = await Promise.all([
      gemini.extractPDFData({ pdfPath: files[0].path }),
      gemini.extractPDFData({ pdfPath: files[1].path })
    ]);
    
    // Simple comparison
    const comparison = {
      pdf1: pdf1Data,
      pdf2: pdf2Data,
      differences: JSON.stringify(pdf1Data) !== JSON.stringify(pdf2Data)
    };
    
    // Clean up
    for (const file of files) {
      await fs.unlink(file.path).catch(() => {});
    }
    
    res.json(comparison);
  } catch (error: any) {
    console.error('Compare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate PDF form
app.post('/api/validate', upload.single('pdf'), async (req: Request, res: Response) => {
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
  } catch (error: any) {
    console.error('Validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk process PDFs from CSV
app.post('/api/bulk', upload.fields([
  { name: 'template', maxCount: 1 },
  { name: 'csv', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files.template || !files.csv) {
      return res.status(400).json({ error: 'Please provide both template PDF and CSV file' });
    }

    const csvPath = files.csv[0].path;
    const templatePath = files.template[0].path;
    
    // Read CSV (simple implementation - could use csv-parse for production)
    const csvContent = await fs.readFile(csvPath, 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const rowData: Record<string, string> = {};
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
              form.getTextField(inst.field).setText(String(inst.value));
            }
            // Add other field types as needed
          } catch (e: any) {
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
      } catch (error: any) {
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
  } catch (error: any) {
    console.error('Bulk processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PDF Filler Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  🧠 Intelligence Features:');
  console.log('  - POST /api/intelligence-local        - Get AI insights about PDF');
  console.log('  - POST /api/classify-local            - Classify document type');
  console.log('  - POST /api/completeness-local        - Check document completeness');
  console.log('  📄 Core Features:');
  console.log('  - GET  /api/health                    - Check system status');
  console.log('  - POST /api/analyze                   - Analyze PDF structure');
  console.log('  - POST /api/extract                   - Extract data from PDF');
  console.log('  - POST /api/fill                      - Fill PDF form');
  console.log('  - POST /api/compare                   - Compare two PDFs');
  console.log('  - POST /api/validate                  - Validate PDF form');
  console.log('  - POST /api/bulk                      - Bulk process PDFs from CSV');
  console.log('  - POST /api/read-fields-local         - Read form fields from PDF');
  console.log('  - POST /api/fill-pdf-local            - Fill PDF with data and save');
  console.log('  - POST /api/validate-pdf-local        - Validate required fields');
  console.log('  - POST /api/extract-text-local        - Extract full text from PDF');
  console.log('  - POST /api/bulk-fill-local           - Bulk fill PDFs from CSV data');
  console.log('  🎭 Profile Management:');
  console.log('  - GET  /api/profiles                  - List all profiles');
  console.log('  - GET  /api/profiles/:name            - Get specific profile');
  console.log('  - POST /api/profiles                  - Create new profile');
  console.log('  - PUT  /api/profiles/:name            - Update profile');
  console.log('  - DELETE /api/profiles/:name          - Delete profile');
  console.log('  - GET  /api/profiles/:name/export     - Export profile');
  console.log('  - POST /api/profiles/import           - Import profile');
  console.log('  - POST /api/fill-with-profile-local   - Fill PDF using a profile');
});

export default app;