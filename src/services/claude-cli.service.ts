// Claude Code CLI service for PDF processing
// Uses claude.ai Pro/Max accounts (not API keys)
//
// OPTIMIZED FOR CLAUDE SONNET 4.5 (Released Sep 2025)
// - Enhanced prompts with explicit context and motivation
// - Quality modifiers requesting thoroughness and accuracy
// - Faster timeouts (Sonnet 4.5 is 2-3x faster than 3.5)
// - Structured expectations for better JSON output
// - Supports up to 64K output tokens for complex documents

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import {
  PDFExtractionResult,
  PDFValidationResult,
  FillInstruction,
  RateLimiter,
  ExtractOptions,
  ProcessingResult
} from '../types';
import ClaudeAuthHandler from '../claude-auth-handler';

export class ClaudeCLIService {
  private rateLimiter: RateLimiter;
  private authHandler: ClaudeAuthHandler;
  private claudeBinary: string | null = null;

  constructor() {
    this.rateLimiter = {
      requestsPerMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now()
    };
    
    this.authHandler = new ClaudeAuthHandler();
  }

  async ensureClaudeBinary(): Promise<string> {
    if (!this.claudeBinary) {
      this.claudeBinary = await this.authHandler.findClaudeBinary();
      if (!this.claudeBinary) {
        throw new Error('Claude Code not installed. Please install from claude.ai/code');
      }
    }
    return this.claudeBinary;
  }

  async checkAuthStatus(): Promise<boolean> {
    const status = await this.authHandler.checkAuthStatus();
    return status.authenticated;
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
    
    // Claude Pro/Max limits are unknown but likely generous
    // Set conservative limits for now
    if (this.rateLimiter.requestsPerMinute >= 30) {
      throw new Error('Rate limit: Please wait a minute before making more requests');
    }
    
    if (this.rateLimiter.requestsToday >= 500) {
      throw new Error('Daily limit reached. Please try again tomorrow.');
    }
  }

  public async callClaude(prompt: string, options?: { timeout?: number; useJson?: boolean }): Promise<string> {
    await this.checkRateLimit();

    const claudeBin = await this.ensureClaudeBinary();

    // Check if we have an OAuth token
    let oauthToken: string | undefined;
    const os = require('os');
    const home = os.homedir();

    try {
      // Try to read token from config file
      const configPath = path.join(home, '.claude', 'config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      oauthToken = config.oauth_token || config.token;
    } catch {
      // Config file doesn't exist or is invalid
      oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }

    return new Promise((resolve, reject) => {
      // Use JSON output format to avoid markdown wrapping and truncation
      const args = ['-p', '--output-format', options?.useJson !== false ? 'json' : 'text'];
      
      console.log(`Calling Claude with prompt: ${prompt.substring(0, 100)}...`);
      
      const env: Record<string, string> = {
        ...process.env,
        HOME: home,
        // Include OAuth token if available
        ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {})
      };
      
      const claude = spawn(claudeBin, args, {
        env,
        cwd: home  // Run from user home directory for consistent behavior
      });
      
      let output = '';
      let error = '';
      let timeout: NodeJS.Timeout;
      
      // Set custom timeout if specified
      // Sonnet 4.5 is faster and more reliable - increased default to 45s for complex operations
      const timeoutMs = options?.timeout || 45000;
      timeout = setTimeout(() => {
        console.error(`Claude CLI timeout after ${timeoutMs}ms`);
        claude.kill();
        reject(new Error('Claude CLI not responding - may not be authenticated'));
      }, timeoutMs);
      
      claude.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Claude output chunk:', data.toString().substring(0, 100));
      });
      
      claude.stderr.on('data', (data) => {
        error += data.toString();
        console.error('Claude stderr:', data.toString());
      });
      
      claude.on('close', (code) => {
        clearTimeout(timeout);
        this.rateLimiter.requestsPerMinute++;
        this.rateLimiter.requestsToday++;
        
        console.log('Claude CLI closed with code:', code);
        console.log('Full output length:', output.length);
        
        if (code !== 0) {
          reject(new Error(error || 'Claude CLI failed'));
        } else {
          resolve(output.trim());
        }
      });
      
      claude.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Claude spawn error:', err);
        reject(new Error(`Failed to spawn Claude: ${err.message}`));
      });
      
      // Send prompt via stdin
      claude.stdin.write(prompt);
      claude.stdin.end();
    });
  }

  async extractPDFData(options: ExtractOptions): Promise<PDFExtractionResult> {
    const { pdfPath, template, retryCount = 0 } = options;
    const absolutePath = path.resolve(pdfPath);
    
    // Verify file exists
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`PDF file not found: ${absolutePath}`);
    }
    
    // Optimized prompts for Claude Sonnet 4.5
    // Sonnet 4.5 best practices: Be explicit, provide context, request thoroughness
    const prompts = [
      // Primary prompt: Explicit with context and quality modifiers
      `I need to extract structured data from a PDF document for automated form filling and data processing.

Read the PDF file at: ${absolutePath}

Extract ALL information with maximum detail and accuracy. Include:
- Every form field name and its filled value
- All text content organized by section
- Tables with complete row/column data
- Any metadata (dates, signatures, identifiers)
${template ? `\nStructure the output to match this template: ${JSON.stringify(template)}` : ''}

Why this matters: This data will be used to populate other forms and for record-keeping, so completeness and accuracy are critical.

Return ONLY a valid JSON object with the extracted data. No markdown, no explanations—just the JSON.`,

      // Alternative: Simpler but still explicit
      `Task: Extract comprehensive data from PDF for form processing.

PDF location: ${absolutePath}

Requirements:
- Extract all form fields and values
- Include text content and tables
- Maintain data structure and relationships
- Output as clean JSON only

This is for automated processing, so accuracy is essential.`,

      // Fallback: Minimal but clear
      `Extract all data from ${absolutePath} as JSON. Include every field, value, and piece of text. Output JSON only.`
    ];
    
    const promptIndex = retryCount % prompts.length;
    const prompt = prompts[promptIndex];
    
    try {
      // Sonnet 4.5 is faster - reduced timeout from 180s to 90s
      const response = await this.callClaude(prompt, { timeout: 90000, useJson: true });

      let parsedData: any;

      // First, try to parse as direct JSON (when using --output-format json)
      try {
        // Claude's JSON format returns: {"result": "...", "type": "result", ...} or {"content": "...", ...}
        const jsonResponse = JSON.parse(response);

        // Extract the actual content from Claude's response (could be in 'result' or 'content' field)
        const contentField = jsonResponse.result || jsonResponse.content;

        if (contentField) {
          // The content might be a JSON string that needs parsing
          try {
            parsedData = JSON.parse(contentField);
          } catch {
            // Content might be plain text with embedded JSON or markdown code block
            // First try to extract from markdown code block
            const codeBlockMatch = contentField.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
              parsedData = JSON.parse(codeBlockMatch[1]);
            } else {
              // Try to find raw JSON
              const jsonMatch = contentField.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
              }
            }
          }
        } else if (!jsonResponse.type) {
          // Direct JSON response without wrapper (actual PDF data)
          parsedData = jsonResponse;
        }
      } catch {
        // Fallback: Parse as text with embedded JSON (backward compatibility)
        let jsonMatch = response.match(/\{[\s\S]*\}/);

        // If no JSON object found, try array format
        if (!jsonMatch) {
          jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            // Wrap array in object
            const arrayData = JSON.parse(jsonMatch[0]);
            return { formData: arrayData };
          }
        }

        if (jsonMatch) {
          // Clean up common JSON issues
          const jsonString = jsonMatch[0]
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false')
            .replace(/\bNone\b/g, 'null');

          parsedData = JSON.parse(jsonString);
        }
      }

      if (parsedData) {
        return this.cleanExtractedData(parsedData);
      }

      // If we still don't have data, check if response was truncated
      if (!this.isCompleteJSON(response) && retryCount < 2) {
        console.log('Response appears truncated, trying with streaming mode...');

        try {
          // Use streaming mode for large responses
          const streamResponse = await this.callClaudeWithStreaming(prompt, 180000);

          // Parse the streamed response
          const jsonMatch = streamResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            return this.cleanExtractedData(data);
          }
        } catch (streamError: any) {
          console.error('Streaming fallback failed:', streamError);
        }
      }

      // If we still don't have data, retry with simpler prompt
      if (retryCount < 2) {
        console.log(`Retrying with simpler prompt (attempt ${retryCount + 2}/3)`);

        // Use progressively simpler prompts
        const simplifiedPrompts = [
          `Read ${absolutePath} and extract key data as JSON. Focus on the most important fields only.`,
          `Extract just the title and main fields from ${absolutePath} as brief JSON.`
        ];

        if (retryCount < simplifiedPrompts.length) {
          const simplePrompt = simplifiedPrompts[retryCount];
          const simpleResponse = await this.callClaude(simplePrompt, { timeout: 120000, useJson: true });

          try {
            const jsonResponse = JSON.parse(simpleResponse);
            const data = jsonResponse.content ? JSON.parse(jsonResponse.content) : jsonResponse;
            return this.cleanExtractedData(data);
          } catch {
            // Continue to regular retry
          }
        }

        return this.extractPDFData({ ...options, retryCount: retryCount + 1 });
      }

      throw new Error('No valid JSON data found in Claude response after multiple attempts');
    } catch (error: any) {
      console.error('Claude PDF extraction failed:', error);

      // If timeout, try streaming mode
      if (error.message.includes('timeout') && retryCount === 0) {
        console.log('Timeout detected, trying streaming mode...');

        try {
          const streamPrompt = prompts[0]; // Use first prompt
          const streamResponse = await this.callClaudeWithStreaming(streamPrompt, 240000); // 4 minutes

          const jsonMatch = streamResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            return this.cleanExtractedData(data);
          }
        } catch (streamError: any) {
          console.error('Streaming after timeout failed:', streamError);
        }

        // Continue with regular retry
        return this.extractPDFData({ ...options, retryCount: 1 });
      }

      throw new Error(`Failed to extract PDF data: ${error.message}`);
    }
  }

  async validatePDFForm(pdfPath: string, requiredFields?: string[]): Promise<PDFValidationResult> {
    const absolutePath = path.resolve(pdfPath);

    // Optimized for Sonnet 4.5: Explicit context and structured expectations
    const prompt = `Task: Validate PDF form completeness for submission readiness.

PDF location: ${absolutePath}

I need you to analyze this form thoroughly to determine if it's ready for submission.

Analyze:
1. Which fields are completely filled out
2. Which fields are empty or incomplete
3. Overall form completeness status
${requiredFields && requiredFields.length > 0 ?
  `\nPriority fields that MUST be filled: ${JSON.stringify(requiredFields)}` :
  ''}

Why this matters: This validation determines whether the form can be submitted or needs more information.

Return ONLY this JSON structure (no markdown, no explanations):
{
  "isValid": true or false,
  "missingFields": ["field1", "field2"],
  "filledFields": ["field3", "field4"],
  "allFields": ["all", "detected", "fields"],
  "summary": "Brief assessment of form status"
}`;
    
    try {
      const response = await this.callClaude(prompt, { timeout: 120000 });
      
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
      throw new Error('No JSON found in validation response');
    } catch (error: any) {
      console.error('Failed to parse validation response:', error);
      throw new Error('Failed to validate PDF form');
    }
  }

  async generateFillInstructions(pdfPath: string, data: Record<string, any>): Promise<FillInstruction[]> {
    const absolutePath = path.resolve(pdfPath);

    // Optimized for Sonnet 4.5: Clear context, explicit requirements, quality emphasis
    const prompt = `Task: Generate precise field-mapping instructions for automated PDF form filling.

PDF form location: ${absolutePath}

Source data to map:
${JSON.stringify(data, null, 2)}

Requirements:
1. Analyze the PDF form structure and identify all fillable fields
2. Match each data key to the correct PDF field name
3. Determine the correct field type (text, checkbox, radio, dropdown, etc.)
4. Create a complete mapping instruction for each field

Why accuracy matters: These instructions will be executed automatically, so incorrect mappings will result in data being placed in wrong fields.

Return ONLY a JSON array in this exact structure (no markdown, no explanations):
[
  {"field": "exactPDFFieldName", "value": "dataValue", "type": "text"},
  {"field": "checkboxFieldName", "value": true, "type": "checkbox"},
  {"field": "dropdownFieldName", "value": "selectedOption", "type": "dropdown"}
]`;
    
    try {
      const response = await this.callClaude(prompt, { timeout: 120000 });
      
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON array found in instructions');
    } catch (error: any) {
      console.error('Failed to generate fill instructions:', error);
      throw new Error('Failed to generate fill instructions');
    }
  }

  private isCompleteJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      // Check if JSON is truncated by counting braces
      const openBraces = (str.match(/\{/g) || []).length;
      const closeBraces = (str.match(/\}/g) || []).length;
      const openBrackets = (str.match(/\[/g) || []).length;
      const closeBrackets = (str.match(/\]/g) || []).length;

      return openBraces === closeBraces && openBrackets === closeBrackets;
    }
  }

  private async callClaudeWithStreaming(prompt: string, timeout: number = 180000): Promise<string> {
    const claudeBin = await this.ensureClaudeBinary();
    const os = require('os');
    const home = os.homedir();

    return new Promise((resolve, reject) => {
      const args = ['-p', '--output-format', 'stream-json'];

      const claude = spawn(claudeBin, args, {
        env: { ...process.env, HOME: home },
        cwd: home
      });

      let fullContent = '';
      let timeoutHandle: NodeJS.Timeout;

      timeoutHandle = setTimeout(() => {
        claude.kill();
        reject(new Error('Claude streaming timeout'));
      }, timeout);

      claude.stdout.on('data', (data) => {
        const chunk = data.toString();

        // Parse streaming JSON chunks
        const lines = chunk.split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.content) {
              fullContent += json.content;
            }
          } catch {
            // Not a JSON line, skip
          }
        }
      });

      claude.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (code === 0) {
          resolve(fullContent);
        } else {
          reject(new Error(`Claude streaming failed with code ${code}`));
        }
      });

      claude.stdin.write(prompt);
      claude.stdin.end();
    });
  }

  private cleanExtractedData(data: any): PDFExtractionResult {
    const clean = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        // Remove meaningless single letters
        if (obj.match(/^[A-Z]$/)) return null;
        // Clean up whitespace
        return obj.trim();
      }
      
      if (Array.isArray(obj)) {
        return obj.map(clean).filter(item => item !== null && item !== '');
      }
      
      if (typeof obj === 'object') {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const cleanedValue = clean(value);
          if (cleanedValue !== null && cleanedValue !== '') {
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
          error: 'Not authenticated. Please sign in with Claude.'
        };
      }

      await this.checkRateLimit();
      
      const response = await this.callClaude('Say "Claude CLI Service is connected and ready!" if you can read this.', { timeout: 10000 });
      
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
    provider: string;
    rateLimiter: RateLimiter;
  } {
    return {
      provider: 'Claude Pro/Max',
      rateLimiter: { ...this.rateLimiter }
    };
  }

  // Clear authentication (logout)
  async clearAuth(): Promise<void> {
    await this.authHandler.clearAuth();
  }
}

export default ClaudeCLIService;