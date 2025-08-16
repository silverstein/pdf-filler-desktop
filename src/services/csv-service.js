const fs = require('fs').promises;
const path = require('path');
const { parse: csvParse } = require('csv-parse');
const { stringify: csvStringify } = require('csv-stringify');

/**
 * Comprehensive CSV service for parsing, generating, and manipulating CSV files
 * Supports various delimiters, encodings, and data validation
 */
class CSVService {
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
     * @param {string} filePath - Path to the CSV file
     * @param {Object} [options={}] - Parsing options
     * @param {string} [options.delimiter] - Field delimiter (auto-detected if not provided)
     * @param {string} [options.encoding='utf8'] - File encoding
     * @param {boolean} [options.columns=true] - Use first row as column headers
     * @param {boolean} [options.skipEmptyLines=true] - Skip empty rows
     * @param {boolean} [options.trim=true] - Trim whitespace from values
     * @param {string} [options.quote='"'] - Quote character
     * @param {string} [options.escape='"'] - Escape character
     * @returns {Promise<Array<Object>>} Array of objects representing CSV rows
     * @throws {Error} If file doesn't exist, is not readable, or contains invalid CSV
     */
    async parseCSV(filePath, options = {}) {
        try {
            // Check if file exists and is readable
            await fs.access(filePath, fs.constants.R_OK);
            
            // Read file content
            const encoding = options.encoding || this.defaultOptions.encoding;
            const fileContent = await fs.readFile(filePath, { encoding });
            
            // Auto-detect delimiter if not provided
            const delimiter = options.delimiter || this.detectDelimiter(fileContent);
            
            // Merge options with defaults
            const parseOptions = {
                ...this.defaultOptions,
                ...options,
                delimiter
            };
            
            return await this.parseCSVString(fileContent, parseOptions);
            
        } catch (error) {
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
     * @param {string} csvString - CSV content as string
     * @param {Object} [options={}] - Parsing options
     * @param {string} [options.delimiter] - Field delimiter (auto-detected if not provided)
     * @param {boolean} [options.columns=true] - Use first row as column headers
     * @param {boolean} [options.skipEmptyLines=true] - Skip empty rows
     * @param {boolean} [options.trim=true] - Trim whitespace from values
     * @param {string} [options.quote='"'] - Quote character
     * @param {string} [options.escape='"'] - Escape character
     * @returns {Promise<Array<Object>>} Array of objects representing CSV rows
     * @throws {Error} If CSV string contains invalid syntax
     */
    async parseCSVString(csvString, options = {}) {
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
                const parseOptions = {
                    ...this.defaultOptions,
                    ...options,
                    delimiter
                };
                
                const results = [];
                
                // Create parser
                const parser = csvParse(parseOptions);
                
                // Handle data events
                parser.on('readable', function() {
                    let record;
                    while (record = parser.read()) {
                        // Skip empty rows if option is enabled
                        if (parseOptions.skipEmptyLines && this._isEmptyRow(record)) {
                            continue;
                        }
                        
                        // Trim values if option is enabled
                        if (parseOptions.trim && typeof record === 'object') {
                            record = this._trimObjectValues(record);
                        }
                        
                        results.push(record);
                    }
                }.bind(this));
                
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
                
            } catch (error) {
                reject(new Error(`Failed to parse CSV string: ${error.message}`));
            }
        });
    }

    /**
     * Generate CSV string from array of objects
     * @param {Array<Object>} data - Array of objects to convert to CSV
     * @param {Array<string>} [headers] - Custom headers (uses object keys if not provided)
     * @param {Object} [options={}] - Generation options
     * @param {string} [options.delimiter=','] - Field delimiter
     * @param {string} [options.quote='"'] - Quote character
     * @param {string} [options.escape='"'] - Escape character
     * @param {boolean} [options.header=true] - Include header row
     * @returns {Promise<string>} CSV string
     * @throws {Error} If data is invalid or conversion fails
     */
    async generateCSV(data, headers = null, options = {}) {
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
                const stringifyOptions = {
                    delimiter: options.delimiter || ',',
                    quote: options.quote || '"',
                    escape: options.escape || '"',
                    header: options.header !== false, // Default to true
                    columns: finalHeaders
                };
                
                // Generate CSV
                csvStringify(data, stringifyOptions, (error, output) => {
                    if (error) {
                        reject(new Error(`CSV generation error: ${error.message}`));
                    } else {
                        resolve(output);
                    }
                });
                
            } catch (error) {
                reject(new Error(`Failed to generate CSV: ${error.message}`));
            }
        });
    }

    /**
     * Save data as a CSV file
     * @param {Array<Object>} data - Array of objects to save
     * @param {string} outputPath - Path where to save the CSV file
     * @param {Array<string>} [headers] - Custom headers (uses object keys if not provided)
     * @param {Object} [options={}] - Generation and file options
     * @param {string} [options.encoding='utf8'] - File encoding
     * @param {string} [options.delimiter=','] - Field delimiter
     * @returns {Promise<string>} Path to the saved file
     * @throws {Error} If unable to write to the output path or data is invalid
     */
    async saveCSV(data, outputPath, headers = null, options = {}) {
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
            
        } catch (error) {
            throw new Error(`Failed to save CSV to ${outputPath}: ${error.message}`);
        }
    }

    /**
     * Auto-detect the delimiter used in a CSV sample
     * @param {string} sample - Sample of CSV content (first few lines recommended)
     * @param {number} [sampleSize=1000] - Number of characters to analyze
     * @returns {string} Detected delimiter character
     */
    detectDelimiter(sample, sampleSize = 1000) {
        try {
            if (typeof sample !== 'string' || sample.length === 0) {
                return this.defaultOptions.delimiter;
            }
            
            // Use only the first portion of the sample for efficiency
            const testSample = sample.substring(0, sampleSize);
            
            // Count occurrences of each delimiter
            const counts = {};
            for (const delimiter of this.supportedDelimiters) {
                counts[delimiter] = (testSample.match(new RegExp('\\' + delimiter, 'g')) || []).length;
            }
            
            // Find the delimiter with the highest count
            const sortedDelimiters = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
            
            // Return the most common delimiter, or default if none found
            if (counts[sortedDelimiters[0]] > 0) {
                return sortedDelimiters[0];
            }
            
            return this.defaultOptions.delimiter;
            
        } catch (error) {
            console.warn(`Error detecting delimiter: ${error.message}, using default`);
            return this.defaultOptions.delimiter;
        }
    }

    /**
     * Validate that a file contains valid CSV data
     * @param {string} filePath - Path to the CSV file to validate
     * @param {Object} [options={}] - Validation options
     * @param {number} [options.maxRows=100] - Maximum rows to check (0 = all rows)
     * @param {boolean} [options.requireHeaders=true] - Whether headers are required
     * @param {Array<string>} [options.requiredColumns] - Required column names
     * @returns {Promise<Object>} Validation result with isValid boolean and details
     * @throws {Error} If file doesn't exist or is not readable
     */
    async validateCSV(filePath, options = {}) {
        try {
            // Check if file exists and is readable
            await fs.access(filePath, fs.constants.R_OK);
            
            const validationOptions = {
                maxRows: options.maxRows || 100,
                requireHeaders: options.requireHeaders !== false,
                requiredColumns: options.requiredColumns || []
            };
            
            // Parse a sample of the CSV
            const parseOptions = {
                ...this.defaultOptions,
                ...(validationOptions.maxRows > 0 ? { to_line: validationOptions.maxRows } : {})
            };
            
            let data;
            try {
                data = await this.parseCSV(filePath, parseOptions);
            } catch (parseError) {
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
            
            const issues = [];
            const headers = data.length > 0 ? Object.keys(data[0]) : [];
            
            // Check if headers are required
            if (validationOptions.requireHeaders && headers.length === 0) {
                issues.push('No headers found in CSV file');
            }
            
            // Check for required columns
            if (validationOptions.requiredColumns.length > 0) {
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
            
            return {
                isValid: issues.length === 0,
                details: {
                    canRead: true,
                    hasValidStructure: true,
                    rowCount: data.length,
                    columnCount: headers.length,
                    headers: headers,
                    issues: issues,
                    delimiter: this.detectDelimiter(await fs.readFile(filePath, 'utf8')),
                    estimatedTotalRows: data.length // Note: May be limited by maxRows option
                }
            };
            
        } catch (error) {
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
     * @param {string} filePath - Path to the CSV file
     * @param {Object} [options={}] - Analysis options
     * @returns {Promise<Object>} CSV file information
     */
    async getCSVInfo(filePath, options = {}) {
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
            
        } catch (error) {
            throw new Error(`Failed to get CSV info: ${error.message}`);
        }
    }

    /**
     * Check if a row object is empty (all values are empty strings or null)
     * @private
     * @param {Object} row - Row object to check
     * @returns {boolean} True if row is empty
     */
    _isEmptyRow(row) {
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
     * @private
     * @param {Object} obj - Object to trim
     * @returns {Object} Object with trimmed string values
     */
    _trimObjectValues(obj) {
        const trimmed = {};
        for (const [key, value] of Object.entries(obj)) {
            trimmed[key] = typeof value === 'string' ? value.trim() : value;
        }
        return trimmed;
    }
}

module.exports = CSVService;