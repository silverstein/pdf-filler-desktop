const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFSignature } = require('pdf-lib');
const pdfParse = require('pdf-parse');

/**
 * Comprehensive PDF service for form manipulation and text extraction
 * Handles password-protected PDFs and various field types
 */
class PDFService {
    constructor() {
        this.supportedFieldTypes = ['text', 'checkbox', 'radio', 'dropdown', 'signature'];
    }

    /**
     * Read all form fields from a PDF with their types and current values
     * @param {string} pdfPath - Path to the PDF file
     * @param {string} [password] - Password for encrypted PDFs
     * @returns {Promise<Array>} Array of field objects with name, type, value, and options
     * @throws {Error} If PDF is corrupted, password is incorrect, or file doesn't exist
     */
    async readFormFields(pdfPath, password = null) {
        try {
            // Check if file exists
            await fs.access(pdfPath);
            
            // Read PDF file
            const pdfBytes = await fs.readFile(pdfPath);
            
            // Load PDF document
            let pdfDoc;
            try {
                pdfDoc = await PDFDocument.load(pdfBytes, { 
                    password: password || undefined,
                    ignoreEncryption: false
                });
            } catch (error) {
                if (error.message.includes('password') || error.message.includes('encrypted')) {
                    throw new Error('PDF is password protected. Please provide the correct password.');
                }
                if (error.message.includes('Invalid PDF')) {
                    throw new Error('Invalid or corrupted PDF file.');
                }
                throw error;
            }

            const form = pdfDoc.getForm();
            const fields = form.getFields();
            const fieldData = [];

            for (const field of fields) {
                const fieldInfo = {
                    name: field.getName(),
                    type: this._getFieldType(field),
                    value: this._getFieldValue(field),
                    required: false, // pdf-lib doesn't expose required flag directly
                    readOnly: field.isReadOnly ? field.isReadOnly() : false,
                    options: null
                };

                // Get options for dropdown and radio fields
                if (field instanceof PDFDropdown) {
                    fieldInfo.options = field.getOptions();
                } else if (field instanceof PDFRadioGroup) {
                    fieldInfo.options = field.getOptions();
                }

                fieldData.push(fieldInfo);
            }

            return fieldData;

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`PDF file not found: ${pdfPath}`);
            }
            throw error;
        }
    }

    /**
     * Fill form fields in a PDF with provided data
     * @param {string} pdfPath - Path to the PDF file
     * @param {Object} data - Object with field names as keys and values to fill
     * @param {string} [password] - Password for encrypted PDFs
     * @returns {Promise<PDFDocument>} Modified PDF document ready for saving
     * @throws {Error} If PDF is corrupted, password is incorrect, or field doesn't exist
     */
    async fillFormFields(pdfPath, data, password = null) {
        try {
            // Check if file exists
            await fs.access(pdfPath);
            
            // Read PDF file
            const pdfBytes = await fs.readFile(pdfPath);
            
            // Load PDF document
            let pdfDoc;
            try {
                pdfDoc = await PDFDocument.load(pdfBytes, { 
                    password: password || undefined,
                    ignoreEncryption: false
                });
            } catch (error) {
                if (error.message.includes('password') || error.message.includes('encrypted')) {
                    throw new Error('PDF is password protected. Please provide the correct password.');
                }
                if (error.message.includes('Invalid PDF')) {
                    throw new Error('Invalid or corrupted PDF file.');
                }
                throw error;
            }

            const form = pdfDoc.getForm();
            const filledFields = [];
            const errors = [];

            // Fill each field with provided data
            for (const [fieldName, value] of Object.entries(data)) {
                try {
                    const field = form.getField(fieldName);
                    
                    if (field instanceof PDFTextField) {
                        field.setText(String(value));
                        filledFields.push(fieldName);
                    } else if (field instanceof PDFCheckBox) {
                        if (value === true || value === 'true' || value === 'on' || value === 1) {
                            field.check();
                        } else {
                            field.uncheck();
                        }
                        filledFields.push(fieldName);
                    } else if (field instanceof PDFRadioGroup) {
                        field.select(String(value));
                        filledFields.push(fieldName);
                    } else if (field instanceof PDFDropdown) {
                        field.select(String(value));
                        filledFields.push(fieldName);
                    } else if (field instanceof PDFSignature) {
                        // Signature fields require special handling - skip for now
                        errors.push(`Signature field '${fieldName}' cannot be filled programmatically`);
                    }
                } catch (fieldError) {
                    errors.push(`Error filling field '${fieldName}': ${fieldError.message}`);
                }
            }

            // Log results
            console.log(`Successfully filled ${filledFields.length} fields:`, filledFields);
            if (errors.length > 0) {
                console.warn('Field filling errors:', errors);
            }

            return pdfDoc;

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`PDF file not found: ${pdfPath}`);
            }
            throw error;
        }
    }

    /**
     * Save a modified PDF document to a file
     * @param {PDFDocument} pdfDoc - The PDF document to save
     * @param {string} outputPath - Path where to save the PDF
     * @returns {Promise<string>} Path to the saved file
     * @throws {Error} If unable to write to the output path
     */
    async saveFilledPDF(pdfDoc, outputPath) {
        try {
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.mkdir(outputDir, { recursive: true });

            // Serialize the PDF document
            const pdfBytes = await pdfDoc.save();

            // Write to file
            await fs.writeFile(outputPath, pdfBytes);

            return outputPath;

        } catch (error) {
            throw new Error(`Failed to save PDF to ${outputPath}: ${error.message}`);
        }
    }

    /**
     * Extract all text content from a PDF
     * @param {string} pdfPath - Path to the PDF file
     * @param {string} [password] - Password for encrypted PDFs
     * @returns {Promise<Object>} Object with text, pages, and metadata
     * @throws {Error} If PDF is corrupted, password is incorrect, or file doesn't exist
     */
    async extractFullText(pdfPath, password = null) {
        try {
            // Check if file exists
            await fs.access(pdfPath);
            
            // Read PDF file
            const pdfBuffer = await fs.readFile(pdfPath);
            
            // Parse PDF with password if provided
            const options = {};
            if (password) {
                options.password = password;
            }

            let result;
            try {
                result = await pdfParse(pdfBuffer, options);
            } catch (error) {
                if (error.message.includes('password') || error.message.includes('encrypted')) {
                    throw new Error('PDF is password protected. Please provide the correct password.');
                }
                if (error.message.includes('Invalid PDF')) {
                    throw new Error('Invalid or corrupted PDF file.');
                }
                throw error;
            }

            return {
                text: result.text,
                pages: result.numpages,
                info: result.info,
                metadata: result.metadata,
                version: result.version
            };

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`PDF file not found: ${pdfPath}`);
            }
            throw error;
        }
    }

    /**
     * Validate that required fields are filled in a PDF form
     * @param {string} pdfPath - Path to the PDF file
     * @param {Array<string>} requiredFields - Array of required field names
     * @param {string} [password] - Password for encrypted PDFs
     * @returns {Promise<Object>} Validation result with isValid boolean and missing fields array
     * @throws {Error} If PDF is corrupted, password is incorrect, or file doesn't exist
     */
    async validateForm(pdfPath, requiredFields, password = null) {
        try {
            const fields = await this.readFormFields(pdfPath, password);
            const fieldMap = new Map(fields.map(field => [field.name, field]));
            
            const missingFields = [];
            const invalidFields = [];

            for (const requiredFieldName of requiredFields) {
                const field = fieldMap.get(requiredFieldName);
                
                if (!field) {
                    invalidFields.push(`Field '${requiredFieldName}' does not exist in the PDF`);
                    continue;
                }

                // Check if field has a value
                if (this._isFieldEmpty(field)) {
                    missingFields.push(requiredFieldName);
                }
            }

            return {
                isValid: missingFields.length === 0 && invalidFields.length === 0,
                missingFields,
                invalidFields,
                totalRequired: requiredFields.length,
                filled: requiredFields.length - missingFields.length
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Get information about a PDF file (pages, fields, encryption status)
     * @param {string} pdfPath - Path to the PDF file
     * @param {string} [password] - Password for encrypted PDFs
     * @returns {Promise<Object>} PDF information object
     */
    async getPDFInfo(pdfPath, password = null) {
        try {
            const textInfo = await this.extractFullText(pdfPath, password);
            const fields = await this.readFormFields(pdfPath, password);

            return {
                path: pdfPath,
                pages: textInfo.pages,
                hasForm: fields.length > 0,
                fieldCount: fields.length,
                fieldTypes: this._groupFieldsByType(fields),
                encrypted: password !== null,
                version: textInfo.version,
                info: textInfo.info
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Determine the type of a PDF form field
     * @private
     * @param {Object} field - PDF field object
     * @returns {string} Field type string
     */
    _getFieldType(field) {
        if (field instanceof PDFTextField) return 'text';
        if (field instanceof PDFCheckBox) return 'checkbox';
        if (field instanceof PDFRadioGroup) return 'radio';
        if (field instanceof PDFDropdown) return 'dropdown';
        if (field instanceof PDFSignature) return 'signature';
        return 'unknown';
    }

    /**
     * Get the current value of a PDF form field
     * @private
     * @param {Object} field - PDF field object
     * @returns {any} Current field value
     */
    _getFieldValue(field) {
        try {
            if (field instanceof PDFTextField) {
                return field.getText() || '';
            } else if (field instanceof PDFCheckBox) {
                return field.isChecked();
            } else if (field instanceof PDFRadioGroup) {
                return field.getSelected() || '';
            } else if (field instanceof PDFDropdown) {
                return field.getSelected() || '';
            } else if (field instanceof PDFSignature) {
                return null; // Signatures don't have readable values
            }
            return null;
        } catch (error) {
            console.warn(`Error getting value for field ${field.getName()}:`, error.message);
            return null;
        }
    }

    /**
     * Check if a field is empty or has no value
     * @private
     * @param {Object} field - Field object with type and value
     * @returns {boolean} True if field is empty
     */
    _isFieldEmpty(field) {
        if (field.value === null || field.value === undefined) return true;
        
        switch (field.type) {
            case 'text':
                return field.value.trim() === '';
            case 'checkbox':
                return field.value === false;
            case 'radio':
            case 'dropdown':
                return field.value === '';
            case 'signature':
                return field.value === null;
            default:
                return true;
        }
    }

    /**
     * Group fields by their type for statistics
     * @private
     * @param {Array} fields - Array of field objects
     * @returns {Object} Object with field type counts
     */
    _groupFieldsByType(fields) {
        const groups = {};
        for (const field of fields) {
            groups[field.type] = (groups[field.type] || 0) + 1;
        }
        return groups;
    }
}

module.exports = PDFService;