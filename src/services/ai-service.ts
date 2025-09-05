import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import {
  PDFExtractionResult,
  PDFValidationResult,
  FillInstruction,
  RateLimiter,
  ExtractOptions,
  ProcessingResult
} from '../types';

export class AIService {
  private gemini: any; // Will be initialized asynchronously
  private currentModel: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  private useFlashFallback: boolean = true; // Temporarily force Flash due to quota
  private rateLimiter: RateLimiter;
  private configDir: string;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Determine if running in production (Electron packaged app)
    const isProduction = __dirname.includes('app.asar');
    
    if (isProduction) {
      const resourcesPath = path.join(__dirname, '../../');
      this.configDir = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local/.gemini');
    } else {
      this.configDir = path.join(__dirname, '../../gemini-cli-local/.gemini');
    }

    this.currentModel = 'gemini-2.5-flash'; // Start with Flash due to quota limits
    
    this.rateLimiter = {
      requestsPerMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now()
    };
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // CRITICAL: Set HOME to our local gemini directory for OAuth to work
      const originalHome = process.env.HOME;
      process.env.HOME = this.configDir.replace('/.gemini', '');
      
      // Dynamically import the ESM module
      const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
      
      // Initialize Gemini provider with OAuth
      this.gemini = createGeminiProvider({
        authType: 'oauth-personal'
        // The provider will automatically look for credentials in our local .gemini directory
      });
      
      // Restore original HOME
      if (originalHome) {
        process.env.HOME = originalHome;
      }
      
      this.initialized = true;
    })();

    return this.initPromise;
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

  private incrementRateLimit(): void {
    this.rateLimiter.requestsPerMinute++;
    this.rateLimiter.requestsToday++;
  }

  private async getModel() {
    await this.initialize();
    const modelName = this.useFlashFallback ? 'gemini-2.5-flash' : this.currentModel;
    return this.gemini(modelName);
  }

  async checkAuthStatus(): Promise<boolean> {
    try {
      const oauthPath = path.join(this.configDir, 'oauth_creds.json');
      await fs.access(oauthPath);
      return true;
    } catch {
      return false;
    }
  }

  async extractPDFData(options: ExtractOptions): Promise<PDFExtractionResult> {
    await this.checkRateLimit();
    
    const { pdfPath, template, retryCount = 0 } = options;
    const absolutePath = path.resolve(pdfPath);

    try {
      let prompt = this.useFlashFallback
        ? `Look at the PDF at: ${absolutePath}\n\nTell me what information you see in this document. Include all filled values, text content, and any structured data like tables.`
        : `Extract all filled data/values from the PDF at: ${absolutePath}

Read the PDF and extract every piece of information that has been filled in or entered.
For forms, extract the value of each filled field.
For documents, extract key information like names, dates, amounts, etc.
If there are tables, extract them as arrays.`;

      if (template) {
        prompt += `\n\nUse this template structure: ${JSON.stringify(template)}.`;
      }

      // For extraction, we'll use generateText and parse JSON from the response
      // This gives us more flexibility than a fixed schema
      const { text } = await generateText({
        model: await this.getModel(),
        prompt: prompt + '\n\nReturn the extracted data as a JSON object. Return ONLY the JSON object, no other text.',
        temperature: 0.1
      });

      this.incrementRateLimit();

      // Parse the JSON response
      try {
        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        // Fix common formatting issues
        const jsonString = jsonMatch[0]
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');

        const data = JSON.parse(jsonString);
        return this.cleanExtractedData(data);
      } catch (parseError) {
        console.error('Failed to parse extraction response:', text);
        throw new Error('Failed to parse PDF extraction data');
      }
    } catch (error: any) {
      console.error('PDF extraction error:', error);
      
      // Handle quota errors
      if (error.message?.includes('429') || error.message?.includes('quota')) {
        this.useFlashFallback = true;
        
        if (retryCount < 2) {
          return this.extractPDFData({ ...options, retryCount: retryCount + 1 });
        }
      }
      
      throw error;
    }
  }

  async validatePDFForm(pdfPath: string, requiredFields?: string[]): Promise<PDFValidationResult> {
    await this.checkRateLimit();
    
    const absolutePath = path.resolve(pdfPath);

    try {
      const prompt = `Look at the PDF document at: ${absolutePath}

Read the PDF and tell me what information is filled in and what is missing.

${requiredFields && requiredFields.length > 0 ? 
  `Focus on these specific fields: ${JSON.stringify(requiredFields)}` : 
  'List all the information you can find in the PDF.'}

Determine if all required fields are filled.

Return as JSON with this structure:
{
  "isValid": boolean,
  "missingFields": ["field1", "field2"],
  "filledFields": ["field3", "field4"],
  "allFields": ["field1", "field2", "field3", "field4"],
  "summary": "Description of validation results"
}`;

      const { text } = await generateText({
        model: await this.getModel(),
        prompt: prompt + '\n\nReturn ONLY the JSON object.',
        temperature: 0.1
      });

      this.incrementRateLimit();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in validation response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        isValid: parsed.isValid || false,
        missingFields: parsed.missingFields || [],
        filledFields: parsed.filledFields || [],
        allFields: parsed.allFields || [],
        summary: parsed.summary || ''
      };
    } catch (error: any) {
      console.error('PDF validation error:', error);
      throw error;
    }
  }

  async generateFillInstructions(pdfPath: string, data: Record<string, any>): Promise<FillInstruction[]> {
    await this.checkRateLimit();
    
    const absolutePath = path.resolve(pdfPath);

    try {
      const prompt = `Given the PDF form at ${absolutePath} and this data: ${JSON.stringify(data)}

Map the data to the form fields and provide instructions for filling each field.
Match the data keys to the appropriate form field names.

Return as a JSON array with this structure:
[
  {"field": "fieldName", "value": "value", "type": "text"},
  {"field": "checkbox1", "value": true, "type": "checkbox"},
  {"field": "dropdown1", "value": "option", "type": "dropdown"}
]

Types can be: text, checkbox, dropdown, or radio`;

      const { text } = await generateText({
        model: await this.getModel(),
        prompt: prompt + '\n\nReturn ONLY the JSON array.',
        temperature: 0.1
      });

      this.incrementRateLimit();
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure each instruction has the required fields
      return parsed.map((item: any) => ({
        field: item.field || '',
        value: item.value,
        type: item.type || 'text'
      }));
    } catch (error: any) {
      console.error('Fill instructions generation error:', error);
      throw error;
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

  // Utility method to test the connection
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
      
      const { text } = await generateText({
        model: await this.getModel(),
        prompt: 'Say "PDF Filler AI Service is connected and ready!" if you can read this.',
        temperature: 0
      });

      this.incrementRateLimit();
      
      return {
        success: true,
        data: text
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get current model and rate limit status
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