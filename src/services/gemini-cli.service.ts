// TypeScript version of the working Gemini CLI implementation
// This uses direct CLI spawning with MCP filesystem support for PDF access

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  PDFAnalysisResult,
  PDFExtractionResult,
  PDFValidationResult,
  FillInstruction,
  RateLimiter,
  ExtractOptions,
  ProcessingResult
} from '../types';

export class GeminiCLIService {
  private rateLimiter: RateLimiter;
  private currentModel: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  private useFlashFallback: boolean = true; // Default to Flash for most operations
  private geminiPath: string;
  private localGeminiHome: string;

  constructor() {
    this.rateLimiter = {
      requestsPerMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now()
    };
    
    this.currentModel = 'gemini-2.5-pro';
    
    // Determine paths based on environment
    const isProduction = __dirname.includes('app.asar');
    
    if (isProduction) {
      const resourcesPath = path.join(__dirname, '../../');
      this.geminiPath = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local/node_modules/.bin/gemini');
      this.localGeminiHome = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local');
    } else {
      this.geminiPath = path.join(__dirname, '../../gemini-cli-local/node_modules/.bin/gemini');
      this.localGeminiHome = path.join(__dirname, '../../gemini-cli-local');
    }
  }

  async checkGeminiCLI(): Promise<boolean> {
    try {
      await fs.access(this.geminiPath);
      return true;
    } catch {
      return false;
    }
  }

  async checkAuthStatus(): Promise<boolean> {
    try {
      const oauthPath = path.join(this.localGeminiHome, '.gemini', 'oauth_creds.json');
      await fs.access(oauthPath);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset minute counter
    if (now - this.rateLimiter.lastMinuteReset > 60000) {
      this.rateLimiter.requestsPerMinute = 0;
      this.rateLimiter.lastMinuteReset = now;
    }
    
    // Reset daily counter
    if (now - this.rateLimiter.lastDayReset > 86400000) {
      this.rateLimiter.requestsToday = 0;
      this.rateLimiter.lastDayReset = now;
    }
    
    // Check limits
    if (this.rateLimiter.requestsPerMinute >= 50) {
      throw new Error('Rate limit: Please wait a minute before making more requests');
    }
    
    if (this.rateLimiter.requestsToday >= 900) {
      throw new Error('Daily limit approaching. Please try again tomorrow.');
    }
  }

  public async callGemini(prompt: string, forcePro: boolean = false): Promise<string> {
    await this.checkRateLimit();
    
    return new Promise((resolve, reject) => {
      // Force Pro for intelligence analysis, otherwise use Flash by default
      let model: string;
      if (forcePro) {
        model = 'gemini-2.5-pro';
      } else {
        model = this.useFlashFallback ? 'gemini-2.5-flash' : this.currentModel;
      }
      const args = ['-m', model, '-p', prompt];
      console.log(`Using model: ${model} (forcePro=${forcePro}, fallback=${this.useFlashFallback})`);
      
      // Set up environment with local Gemini home for OAuth credentials
      const env = {
        ...process.env,
        HOME: this.localGeminiHome,
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || 'pdf-filler-desktop'
      };
      
      const gemini = spawn(this.geminiPath, args, { 
        env,
        cwd: path.join(__dirname, '../..') // Run from project root
      });
      
      let output = '';
      let error = '';
      let timeout: NodeJS.Timeout;
      
      // Set a 5-minute timeout for complex PDF operations
      timeout = setTimeout(() => {
        console.error('Gemini CLI timeout after 5 minutes');
        gemini.kill();
        reject(new Error('Gemini CLI timeout - took too long to respond'));
      }, 300000);
      
      gemini.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Gemini output chunk:', data.toString().substring(0, 100));
      });
      
      gemini.stderr.on('data', (data) => {
        error += data.toString();
        console.error('Gemini stderr:', data.toString());
        
        // Auto-fallback to Flash on quota errors
        if (data.toString().includes('429') || 
            data.toString().includes('quota') || 
            data.toString().includes('RESOURCE_EXHAUSTED')) {
          this.useFlashFallback = true;
          console.log('Switching to Flash model due to quota limits');
        }
      });
      
      gemini.on('close', (code) => {
        clearTimeout(timeout);
        this.rateLimiter.requestsPerMinute++;
        this.rateLimiter.requestsToday++;
        
        console.log('Gemini CLI closed with code:', code);
        console.log('Full output:', output.substring(0, 500));
        
        if (code !== 0) {
          reject(new Error(error || 'Gemini CLI failed'));
        } else {
          // Clean output - remove known noise
          const cleanOutput = output
            .split('\n')
            .filter(line => !line.includes('Loaded cached credentials'))
            .filter(line => !line.includes('Warning:'))
            .filter(line => !line.includes('[ERROR]'))
            .join('\n')
            .trim();
          
          resolve(cleanOutput);
        }
      });
    });
  }

  async analyzePDF(pdfPath: string, retryCount: number = 0): Promise<PDFAnalysisResult> {
    // Use absolute path for MCP filesystem access
    const absolutePath = path.resolve(pdfPath);
    
    let prompt: string;
    
    if (this.useFlashFallback) {
      // Simpler prompts for Flash model
      const flashPrompts = [
        `Read the PDF at: ${absolutePath}

This is a form or document. Tell me:
1. What type of document is it?
2. What data/values are filled in?

Don't list field names like "f1_1" - extract the actual information.

Return as JSON with type, pages, hasFormFields, formFields (with actual labels and values), and summary.

Return ONLY the JSON object.`,
        `Read the PDF at: ${absolutePath}

What type of document is this? What information does it contain?

Format your response as JSON with type, pages, hasFormFields, formFields, and summary.`,
        `Check the PDF at: ${absolutePath}

Describe the document and any fields or data you find.

Return as JSON with document type, page count, and field information.`
      ];
      prompt = flashPrompts[retryCount % flashPrompts.length];
    } else {
      // Detailed prompt for Pro model
      prompt = `Analyze the PDF file at: ${absolutePath}

For this PDF, identify the form structure AND extract any filled values.

Return a JSON object with this structure:
{
  "type": "form|document|mixed",
  "pages": <number>,
  "hasFormFields": <boolean>,
  "formFields": [
    {
      "name": "<field_name>",
      "type": "text|checkbox|dropdown",
      "required": <boolean>,
      "value": "<current value if filled, null if empty>"
    }
  ],
  "summary": "<brief description>"
}

Include the current value for each field if it's filled in.
Return ONLY the JSON object, no other text.`;
    }
    
    const response = await this.callGemini(prompt);
    
    try {
      // Check if Flash is refusing to process PDFs
      if (response.includes('cannot directly') || response.includes('cannot interpret')) {
        if (retryCount < 2) {
          console.log(`Flash refused analysis, retrying with different prompt (attempt ${retryCount + 2}/3)`);
          return this.analyzePDF(pdfPath, retryCount + 1);
        }
      }
      
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Fix Python-style booleans before parsing
        const jsonString = jsonMatch[0]
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');
        
        const parsed = JSON.parse(jsonString);
        
        // Ensure proper structure
        return {
          type: parsed.type || 'document',
          pages: parsed.pages || 1,
          hasFormFields: parsed.hasFormFields || false,
          formFields: parsed.formFields || [],
          summary: parsed.summary || '',
          metadata: parsed.metadata
        };
      }
      throw new Error('No JSON found in response');
    } catch (e) {
      console.error('Failed to parse response:', response);
      throw new Error('Failed to parse PDF analysis');
    }
  }

  async extractPDFData(options: ExtractOptions): Promise<PDFExtractionResult> {
    const { pdfPath, template, retryCount = 0 } = options;
    const absolutePath = path.resolve(pdfPath);
    
    let prompt: string;
    
    if (this.useFlashFallback) {
      const flashPrompts = [
        `Look at the PDF at: ${absolutePath}\n\nTell me what information you see in this document. Format your response as JSON.`,
        `Read the PDF file at: ${absolutePath}\n\nList all the data you find. Return as JSON.`,
        `Analyze the PDF at: ${absolutePath}\n\nWhat information does it contain? Format as JSON.`
      ];
      prompt = flashPrompts[retryCount % flashPrompts.length];
    } else {
      prompt = `Extract all filled data/values from the PDF at: ${absolutePath}
    
Read the PDF and extract every piece of information that has been filled in or entered.
For forms, extract the value of each filled field.
For documents, extract key information like names, dates, amounts, etc.`;
      
      if (template) {
        prompt += `\n\nUse this template structure: ${JSON.stringify(template)}.`;
      }
      
      prompt += '\n\nReturn the extracted data as a JSON object. Return ONLY the JSON object.';
    }
    
    const response = await this.callGemini(prompt);
    
    try {
      // Check if Flash is refusing
      if (response.includes('cannot directly') || response.includes('cannot interpret')) {
        if (retryCount < 2) {
          console.log(`Flash refused, retrying with different prompt (attempt ${retryCount + 2}/3)`);
          return this.extractPDFData({ ...options, retryCount: retryCount + 1 });
        }
      }
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Fix Python-style booleans before parsing
        const jsonString = jsonMatch[0]
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');
        
        const data = JSON.parse(jsonString);
        return this.cleanExtractedData(data);
      }
      throw new Error('No JSON found');
    } catch (e) {
      console.error('Failed to parse extraction:', response);
      throw new Error('Failed to extract PDF data');
    }
  }

  async validatePDFForm(pdfPath: string, requiredFields?: string[]): Promise<PDFValidationResult> {
    const absolutePath = path.resolve(pdfPath);
    
    const prompt = `Look at the PDF document at: ${absolutePath}

Read the PDF and tell me what information is filled in and what is missing.

${requiredFields && requiredFields.length > 0 ? 
  `Focus on these specific fields: ${JSON.stringify(requiredFields)}` : 
  'List all the information you can find in the PDF.'}

Based on what you see in the PDF, return ONLY this JSON:
{
  "isValid": true or false,
  "missingFields": ["fields that appear empty"],
  "filledFields": ["fields that have data"],
  "allFields": ["all fields you found"],
  "summary": "what you found"
}`;
    
    const response = await this.callGemini(prompt);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isValid: parsed.isValid || false,
          missingFields: parsed.missingFields || [],
          filledFields: parsed.filledFields || [],
          allFields: parsed.allFields || [],
          summary: parsed.summary || ''
        };
      }
      throw new Error('No JSON found in response');
    } catch (e) {
      console.error('Failed to parse validation response:', response);
      throw new Error('Failed to validate PDF form');
    }
  }

  async generateFillInstructions(pdfPath: string, data: Record<string, any>): Promise<FillInstruction[]> {
    const absolutePath = path.resolve(pdfPath);
    
    const prompt = `Given the PDF form at ${absolutePath} and this data: ${JSON.stringify(data)}
    
Provide instructions for filling the form. Return a JSON array:
[
  {"field": "name", "value": "John Doe", "type": "text"},
  {"field": "agree", "value": true, "type": "checkbox"}
]

Return ONLY the JSON array.`;
    
    const response = await this.callGemini(prompt);
    
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON array found');
    } catch (e) {
      console.error('Failed to parse instructions:', response);
      throw new Error('Failed to generate fill instructions');
    }
  }

  private cleanExtractedData(data: any): PDFExtractionResult {
    const clean = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        // Remove standalone letter codes that aren't meaningful
        if (obj.match(/^[A-Z]$/)) return null;
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(clean).filter(item => item !== null);
      }
      
      if (typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const cleanedValue = clean(value);
          if (cleanedValue !== null) {
            cleaned[key] = cleanedValue;
          }
        }
        return cleaned;
      }
      
      return obj;
    };
    
    return clean(data);
  }

  // Test connection
  async testConnection(): Promise<ProcessingResult<string>> {
    try {
      const authOk = await this.checkAuthStatus();
      if (!authOk) {
        return {
          success: false,
          error: 'Not authenticated. Please run the setup first.'
        };
      }

      await this.checkRateLimit();
      
      const response = await this.callGemini('Say "Gemini CLI Service is connected and ready!" if you can read this.');
      
      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get status
  getStatus(): {
    model: string;
    useFlashFallback: boolean;
    rateLimiter: RateLimiter;
  } {
    return {
      model: this.currentModel,
      useFlashFallback: this.useFlashFallback,
      rateLimiter: { ...this.rateLimiter }
    };
  }
}