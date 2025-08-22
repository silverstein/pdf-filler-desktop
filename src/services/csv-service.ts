import { promises as fs, constants } from 'fs';
import path from 'path';
import { parse as csvParse, Options as ParseOptions } from 'csv-parse';
import { stringify as csvStringify, Options as StringifyOptions } from 'csv-stringify';

// Type definitions for CSV operations
interface CSVParseOptions extends Partial<ParseOptions> {
  delimiter?: string;
  encoding?: BufferEncoding;
  columns?: boolean;
  skipEmptyLines?: boolean;
  trim?: boolean;
  quote?: string;
  escape?: string;
  to_line?: number;
}

interface CSVGenerateOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  header?: boolean;
  encoding?: BufferEncoding;
}

interface CSVValidationOptions {
  maxRows?: number;
  requireHeaders?: boolean;
  requiredColumns?: string[];
}

interface ValidationDetails {
  canRead: boolean;
  hasValidStructure: boolean;
  rowCount: number;
  columnCount: number;
  headers: string[];
  issues: string[];
  delimiter?: string;
  estimatedTotalRows?: number;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  details: ValidationDetails;
}

interface CSVInfo extends ValidationDetails {
  path: string;
  isValid: boolean;
  size: number;
  modified: Date;
}

/**
 * Comprehensive CSV service for parsing, generating, and manipulating CSV files
 * Supports various delimiters, encodings, and data validation
 */
export class CSVService {
  private supportedDelimiters: string[];
  private supportedEncodings: BufferEncoding[];
  private defaultOptions: CSVParseOptions;

  constructor() {
    this.supportedDelimiters = [',', ';', '\t', '|'];
    this.supportedEncodings = ['utf8', 'utf16le', 'ascii', 'latin1', 'base64', 'hex'];
    this.defaultOptions = {
      delimiter: ',',
      encoding: 'utf8',
      skipEmptyLines: true,
      trim: true,
      columns: true, // Use first row as headers
      quote: '"',
      escape: '"'
    };
  }

  /**
   * Parse a CSV file and return an array of objects
   */
  async parseCSV(filePath: string, options: CSVParseOptions = {}): Promise<Record<string, any>[]> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, constants.R_OK);
      
      // Read file content
      const encoding = options.encoding || this.defaultOptions.encoding || 'utf8';
      const fileContent = await fs.readFile(filePath, { encoding });
      
      // Auto-detect delimiter if not provided
      const delimiter = options.delimiter || this.detectDelimiter(fileContent);
      
      // Merge options with defaults
      const parseOptions: CSVParseOptions = {
        ...this.defaultOptions,
        ...options,
        delimiter
      };
      
      return await this.parseCSVString(fileContent, parseOptions);
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`CSV file not found: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`Cannot read CSV file: ${filePath} - Permission denied`);
      }
      throw new Error(`Failed to parse CSV file: ${error.message}`);
    }
  }

  /**
   * Parse a CSV string and return an array of objects
   */
  async parseCSVString(csvString: string, options: CSVParseOptions = {}): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      try {
        // Validate input
        if (typeof csvString !== 'string') {
          throw new Error('CSV content must be a string');
        }
        
        if (csvString.trim() === '') {
          resolve([]);
          return;
        }
        
        // Auto-detect delimiter if not provided
        const delimiter = options.delimiter || this.detectDelimiter(csvString);
        
        // Merge options with defaults
        const parseOptions: CSVParseOptions = {
          ...this.defaultOptions,
          ...options,
          delimiter
        };
        
        const results: Record<string, any>[] = [];
        
        // Create parser
        const parser = csvParse(parseOptions as ParseOptions);
        
        // Handle data events
        parser.on('readable', () => {
          let record;
          while (record = parser.read()) {
            // Skip empty rows if option is enabled
            if (parseOptions.skipEmptyLines && this.isEmptyRow(record)) {
              continue;
            }
            
            // Trim values if option is enabled
            if (parseOptions.trim && typeof record === 'object') {
              record = this.trimObjectValues(record);
            }
            
            results.push(record);
          }
        });
        
        // Handle errors
        parser.on('error', (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        });
        
        // Handle completion
        parser.on('end', () => {
          resolve(results);
        });
        
        // Write CSV string to parser
        parser.write(csvString);
        parser.end();
        
      } catch (error: any) {
        reject(new Error(`Failed to parse CSV string: ${error.message}`));
      }
    });
  }

  /**
   * Generate CSV string from array of objects
   */
  async generateCSV(
    data: Record<string, any>[], 
    headers: string[] | null = null, 
    options: CSVGenerateOptions = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Validate input
        if (!Array.isArray(data)) {
          throw new Error('Data must be an array');
        }
        
        if (data.length === 0) {
          resolve('');
          return;
        }
        
        // Determine headers
        let finalHeaders = headers;
        if (!finalHeaders && data.length > 0 && typeof data[0] === 'object') {
          finalHeaders = Object.keys(data[0]);
        }
        
        // Set up options
        const stringifyOptions: StringifyOptions = {
          delimiter: options.delimiter || ',',
          quote: options.quote || '"',
          escape: options.escape || '"',
          header: options.header !== false, // Default to true
          columns: finalHeaders || undefined
        };
        
        // Generate CSV
        csvStringify(data, stringifyOptions, (error, output) => {
          if (error) {
            reject(new Error(`CSV generation error: ${error.message}`));
          } else {
            resolve(output);
          }
        });
        
      } catch (error: any) {
        reject(new Error(`Failed to generate CSV: ${error.message}`));
      }
    });
  }

  /**
   * Save data as a CSV file
   */
  async saveCSV(
    data: Record<string, any>[], 
    outputPath: string, 
    headers: string[] | null = null, 
    options: CSVGenerateOptions = {}
  ): Promise<string> {
    try {
      // Generate CSV content
      const csvContent = await this.generateCSV(data, headers, options);
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Write to file
      const encoding = options.encoding || 'utf8';
      await fs.writeFile(outputPath, csvContent, { encoding });
      
      return outputPath;
      
    } catch (error: any) {
      throw new Error(`Failed to save CSV to ${outputPath}: ${error.message}`);
    }
  }

  /**
   * Auto-detect the delimiter used in a CSV sample
   */
  detectDelimiter(sample: string, sampleSize: number = 1000): string {
    try {
      if (typeof sample !== 'string' || sample.length === 0) {
        return this.defaultOptions.delimiter || ',';
      }
      
      // Use only the first portion of the sample for efficiency
      const testSample = sample.substring(0, sampleSize);
      
      // Count occurrences of each delimiter
      const counts: Record<string, number> = {};
      for (const delimiter of this.supportedDelimiters) {
        counts[delimiter] = (testSample.match(new RegExp('\\' + delimiter, 'g')) || []).length;
      }
      
      // Find the delimiter with the highest count
      const sortedDelimiters = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      
      // Return the most common delimiter, or default if none found
      if (counts[sortedDelimiters[0]] > 0) {
        return sortedDelimiters[0];
      }
      
      return this.defaultOptions.delimiter || ',';
      
    } catch (error: any) {
      console.warn(`Error detecting delimiter: ${error.message}, using default`);
      return this.defaultOptions.delimiter || ',';
    }
  }

  /**
   * Validate that a file contains valid CSV data
   */
  async validateCSV(filePath: string, options: CSVValidationOptions = {}): Promise<ValidationResult> {
    try {
      // Check if file exists and is readable
      await fs.access(filePath, constants.R_OK);
      
      const validationOptions: CSVValidationOptions = {
        maxRows: options.maxRows || 100,
        requireHeaders: options.requireHeaders !== false,
        requiredColumns: options.requiredColumns || []
      };
      
      // Parse a sample of the CSV
      const parseOptions: CSVParseOptions = {
        ...this.defaultOptions,
        ...(validationOptions.maxRows && validationOptions.maxRows > 0 ? { to_line: validationOptions.maxRows } : {})
      };
      
      let data: Record<string, any>[];
      try {
        data = await this.parseCSV(filePath, parseOptions);
      } catch (parseError: any) {
        return {
          isValid: false,
          error: parseError.message,
          details: {
            canRead: true,
            hasValidStructure: false,
            rowCount: 0,
            columnCount: 0,
            headers: [],
            issues: [`Parse error: ${parseError.message}`]
          }
        };
      }
      
      const issues: string[] = [];
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      
      // Check if headers are required
      if (validationOptions.requireHeaders && headers.length === 0) {
        issues.push('No headers found in CSV file');
      }
      
      // Check for required columns
      if (validationOptions.requiredColumns && validationOptions.requiredColumns.length > 0) {
        const missingColumns = validationOptions.requiredColumns.filter(
          col => !headers.includes(col)
        );
        if (missingColumns.length > 0) {
          issues.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }
      }
      
      // Check for empty file
      if (data.length === 0) {
        issues.push('CSV file is empty');
      }
      
      // Check for consistent column count
      if (data.length > 1) {
        const firstRowKeys = Object.keys(data[0]);
        const inconsistentRows = data.slice(1).filter(row => 
          Object.keys(row).length !== firstRowKeys.length
        );
        if (inconsistentRows.length > 0) {
          issues.push(`${inconsistentRows.length} rows have inconsistent column count`);
        }
      }
      
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      return {
        isValid: issues.length === 0,
        details: {
          canRead: true,
          hasValidStructure: true,
          rowCount: data.length,
          columnCount: headers.length,
          headers: headers,
          issues: issues,
          delimiter: this.detectDelimiter(fileContent),
          estimatedTotalRows: data.length // Note: May be limited by maxRows option
        }
      };
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          isValid: false,
          error: `File not found: ${filePath}`,
          details: {
            canRead: false,
            hasValidStructure: false,
            rowCount: 0,
            columnCount: 0,
            headers: [],
            issues: [`File not found: ${filePath}`]
          }
        };
      }
      
      if (error.code === 'EACCES') {
        return {
          isValid: false,
          error: `Cannot read file: ${filePath}`,
          details: {
            canRead: false,
            hasValidStructure: false,
            rowCount: 0,
            columnCount: 0,
            headers: [],
            issues: [`Permission denied: ${filePath}`]
          }
        };
      }
      
      throw error;
    }
  }

  /**
   * Get information about a CSV file (rows, columns, size, etc.)
   */
  async getCSVInfo(filePath: string, options: CSVValidationOptions = {}): Promise<CSVInfo> {
    try {
      const validation = await this.validateCSV(filePath, options);
      const stats = await fs.stat(filePath);
      
      return {
        path: filePath,
        isValid: validation.isValid,
        size: stats.size,
        modified: stats.mtime,
        ...validation.details
      };
      
    } catch (error: any) {
      throw new Error(`Failed to get CSV info: ${error.message}`);
    }
  }

  /**
   * Check if a row object is empty (all values are empty strings or null)
   */
  private isEmptyRow(row: any): boolean {
    if (!row || typeof row !== 'object') return true;
    
    const values = Object.values(row);
    return values.every(value => 
      value === null || 
      value === undefined || 
      (typeof value === 'string' && value.trim() === '')
    );
  }

  /**
   * Trim whitespace from all string values in an object
   */
  private trimObjectValues(obj: Record<string, any>): Record<string, any> {
    const trimmed: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      trimmed[key] = typeof value === 'string' ? value.trim() : value;
    }
    return trimmed;
  }
}

export default CSVService;