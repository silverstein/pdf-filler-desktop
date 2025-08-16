// Simplified Gemini Bridge - just pass file paths to Gemini CLI
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class GeminiSimple {
  constructor() {
    this.rateLimiter = {
      requestsPerMinute: 0,
      requestsToday: 0,
      lastMinuteReset: Date.now(),
      lastDayReset: Date.now()
    };
    this.currentModel = 'gemini-2.5-pro'; // Start with Pro
    this.useFlashFallback = true; // TEMPORARILY force Flash due to Pro quota limits
  }

  async checkGeminiCLI() {
    // In production, check app.asar.unpacked directory
    const isProduction = __dirname.includes('app.asar');
    let localGeminiPath;
    if (isProduction) {
      const resourcesPath = path.join(__dirname, '../../');
      localGeminiPath = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local/node_modules/.bin/gemini');
    } else {
      localGeminiPath = path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
    }
    try {
      await fs.access(localGeminiPath);
      return true;
    } catch {
      return false;
    }
  }
  
  getGeminiPath() {
    // In production, use app.asar.unpacked directory
    const isProduction = __dirname.includes('app.asar');
    if (isProduction) {
      const resourcesPath = path.join(__dirname, '../../');
      return path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local/node_modules/.bin/gemini');
    } else {
      return path.join(__dirname, '../gemini-cli-local/node_modules/.bin/gemini');
    }
  }

  async checkRateLimit() {
    const now = Date.now();
    
    if (now - this.rateLimiter.lastMinuteReset > 60000) {
      this.rateLimiter.requestsPerMinute = 0;
      this.rateLimiter.lastMinuteReset = now;
    }
    
    if (now - this.rateLimiter.lastDayReset > 86400000) {
      this.rateLimiter.requestsToday = 0;
      this.rateLimiter.lastDayReset = now;
    }
    
    if (this.rateLimiter.requestsPerMinute >= 50) {
      throw new Error('Rate limit: Please wait a minute before making more requests');
    }
    
    if (this.rateLimiter.requestsToday >= 900) {
      throw new Error('Daily limit approaching. Please try again tomorrow.');
    }
  }

  async callGemini(prompt, forceFlash = false) {
    await this.checkRateLimit();
    
    return new Promise((resolve, reject) => {
      // Use Flash if in fallback mode or forced
      const model = (this.useFlashFallback || forceFlash) ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
      const args = ['-m', model, '-p', prompt];
      console.log(`Using model: ${model} (fallback=${this.useFlashFallback})`);
      
      // Set up environment to use local Gemini config
      const isProduction = __dirname.includes('app.asar');
      let localGeminiHome;
      if (isProduction) {
        const resourcesPath = path.join(__dirname, '../../');
        localGeminiHome = path.join(resourcesPath, 'app.asar.unpacked/gemini-cli-local');
      } else {
        localGeminiHome = path.join(__dirname, '../gemini-cli-local');
      }
      const env = {
        ...process.env,
        HOME: localGeminiHome,
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || 'pdf-filler-desktop'
      };
      
      const gemini = spawn(this.getGeminiPath(), args, { 
        env,
        cwd: path.join(__dirname, '..') // Run from project root
      });
      
      let output = '';
      let error = '';
      let timeout;
      
      // Set a 2-minute timeout (120 seconds)
      timeout = setTimeout(() => {
        console.error('Gemini CLI timeout after 2 minutes');
        gemini.kill();
        reject(new Error('Gemini CLI timeout - took too long to respond'));
      }, 120000);
      
      gemini.stdout.on('data', (data) => {
        output += data.toString();
        console.log('Gemini output chunk:', data.toString().substring(0, 100));
      });
      
      gemini.stderr.on('data', (data) => {
        error += data.toString();
        console.error('Gemini stderr:', data.toString());
        
        // Auto-fallback to Flash on quota errors
        if (data.toString().includes('429') || data.toString().includes('quota') || data.toString().includes('RESOURCE_EXHAUSTED')) {
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

  async analyzePDF(pdfPath, retryCount = 0) {
    // Use absolute path for MCP filesystem access
    const absolutePath = path.resolve(pdfPath);
    
    let prompt;
    
    if (this.useFlashFallback) {
      // Try different phrasings if Flash is being difficult
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
      // Original detailed prompt for Pro
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
        return JSON.parse(jsonString);
      }
      throw new Error('No JSON found in response');
    } catch (e) {
      console.error('Failed to parse response:', response);
      throw new Error('Failed to parse PDF analysis');
    }
  }

  async extractPDFData(pdfPath, template = null, retryCount = 0) {
    // Single extraction for both Pro and Flash
    // Consensus approach didn't improve accuracy, just added latency
    return this.singleExtraction(pdfPath, template, retryCount);
  }
  
  async singleExtraction(pdfPath, template = null, retryCount = 0) {
    const absolutePath = path.resolve(pdfPath);
    
    let prompt;
    
    // Use different prompts for Pro vs Flash
    if (this.useFlashFallback) {
      // Try different phrasings if Flash is being difficult
      const flashPrompts = [
        `Look at the PDF at: ${absolutePath}\n\nTell me what information you see in this document. Format your response as JSON.`,
        `Read the PDF file at: ${absolutePath}\n\nList all the data you find. Return as JSON.`,
        `Analyze the PDF at: ${absolutePath}\n\nWhat information does it contain? Format as JSON.`
      ];
      prompt = flashPrompts[retryCount % flashPrompts.length];
    } else {
      // Detailed prompt for Pro
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
      // Check if Flash is refusing to process PDFs
      if (response.includes('cannot directly') || response.includes('cannot interpret')) {
        if (retryCount < 2) {
          console.log(`Flash refused, retrying with different prompt (attempt ${retryCount + 2}/3)`);
          return this.singleExtraction(pdfPath, template, retryCount + 1);
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
        
        // Post-process to clean up common extraction errors
        return this.cleanExtractedData(data);
      }
      throw new Error('No JSON found');
    } catch (e) {
      console.error('Failed to parse extraction:', response);
      throw new Error('Failed to extract PDF data');
    }
  }
  
  async extractWithConsensus(pdfPath, template = null) {
    const runs = 3; // Run 3 times
    const results = [];
    
    console.log(`Running ${runs} extractions for consensus...`);
    
    for (let i = 0; i < runs; i++) {
      try {
        console.log(`  Run ${i + 1}/${runs}...`);
        const result = await this.singleExtraction(pdfPath, template, i);
        results.push(result);
        // Small delay between runs to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.error(`  Run ${i + 1} failed:`, e.message);
      }
    }
    
    if (results.length === 0) {
      throw new Error('All extraction attempts failed');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // Merge results using consensus
    console.log(`Merging ${results.length} successful extractions...`);
    return this.mergeByConsensus(results);
  }
  
  mergeByConsensus(results) {
    // Take the first result as base structure
    const base = JSON.parse(JSON.stringify(results[0]));
    
    // For each field in base, check if other results have better/different values
    this.improveWithConsensus(base, results);
    
    return base;
  }
  
  improveWithConsensus(obj, results, path = '') {
    for (const key in obj) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (obj[key] === null || obj[key] === undefined) {
        // Try to fill null values from other results
        for (const result of results) {
          const value = this.getNestedValue(result, currentPath);
          if (value !== null && value !== undefined) {
            obj[key] = value;
            break;
          }
        }
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        // Recurse into nested objects
        this.improveWithConsensus(obj[key], results, currentPath);
      } else if (typeof obj[key] === 'boolean') {
        // For booleans, use majority vote
        const values = results.map(r => this.getNestedValue(r, currentPath)).filter(v => v !== null && v !== undefined);
        const trueCount = values.filter(v => v === true).length;
        const falseCount = values.filter(v => v === false).length;
        obj[key] = trueCount >= falseCount;
      }
      // For strings and numbers, keep the first result's value (they're usually consistent)
    }
  }
  
  collectKeys(obj, prefix, keySet) {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
          this.collectKeys(obj[key], fullKey, keySet);
        } else {
          keySet.add(fullKey);
        }
      });
    }
  }
  
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return null;
      current = current[key];
    }
    return current;
  }
  
  getConsensusValue(values) {
    // Filter out null/undefined
    const validValues = values.filter(v => v !== null && v !== undefined);
    
    if (validValues.length === 0) return null;
    if (validValues.length === 1) return validValues[0];
    
    // For numbers and strings, find most common
    const counts = {};
    validValues.forEach(val => {
      const key = JSON.stringify(val);
      counts[key] = (counts[key] || 0) + 1;
    });
    
    // Return the most frequent value
    let maxCount = 0;
    let consensus = validValues[0];
    Object.entries(counts).forEach(([key, count]) => {
      if (count > maxCount) {
        maxCount = count;
        consensus = JSON.parse(key);
      }
    });
    
    return consensus;
  }
  
  reconstructNested(flat) {
    const result = {};
    
    Object.entries(flat).forEach(([path, value]) => {
      const keys = path.split('.');
      let current = result;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      
      current[keys[keys.length - 1]] = value;
    });
    
    return result;
  }
  
  cleanExtractedData(data) {
    // Recursively clean the extracted data
    const clean = (obj) => {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        // Remove standalone letter codes that aren't meaningful
        if (obj.match(/^[A-Z]$/)) return null;
        // Fix date formats if needed
        if (obj.match(/^\d{2}\/\d{2}\/\d{2}$/)) {
          // Keep as is for now
        }
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(clean);
      }
      
      if (typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          cleaned[key] = clean(value);
        }
        return cleaned;
      }
      
      return obj;
    };
    
    return clean(data);
  }

  async generateFillInstructions(pdfPath, data) {
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

  async validatePDFForm(pdfPath, requiredFields) {
    const absolutePath = path.resolve(pdfPath);
    
    // Be very explicit that we want PDF content analysis, not code generation
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
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (e) {
      console.error('Failed to parse validation response:', response);
      throw new Error('Failed to validate PDF form');
    }
  }
}

module.exports = GeminiSimple;