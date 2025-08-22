import { promises as fs } from 'fs';
import path from 'path';
import { 
  PDFDocument, 
  PDFForm, 
  PDFField,
  PDFTextField, 
  PDFCheckBox, 
  PDFRadioGroup, 
  PDFDropdown, 
  PDFSignature 
} from 'pdf-lib';
import pdfParse from 'pdf-parse';

// Type definitions for PDF operations
interface FieldInfo {
  name: string;
  type: string;
  value: any;
  required: boolean;
  readOnly: boolean;
  options: string[] | null;
}

interface PDFInfo {
  path: string;
  pages: number;
  hasForm: boolean;
  fieldCount: number;
  fieldTypes: Record<string, number>;
  encrypted: boolean;
  version: string;
  info: any;
}

interface TextExtractionResult {
  text: string;
  pages: number;
  info: any;
  metadata: any;
  version: string;
}

interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  invalidFields: string[];
  totalRequired: number;
  filled: number;
}

/**
 * Comprehensive PDF service for form manipulation and text extraction
 * Handles password-protected PDFs and various field types
 */
export class PDFService {
  private supportedFieldTypes: string[];

  constructor() {
    this.supportedFieldTypes = ['text', 'checkbox', 'radio', 'dropdown', 'signature'];
  }

  /**
   * Read all form fields from a PDF with their types and current values
   */
  async readFormFields(pdfPath: string, password: string | null = null): Promise<FieldInfo[]> {
    try {
      // Check if file exists
      await fs.access(pdfPath);
      
      // Read PDF file
      const pdfBytes = await fs.readFile(pdfPath);
      
      // Load PDF document
      let pdfDoc: PDFDocument;
      try {
        const loadOptions: any = { ignoreEncryption: false };
        if (password) {
          loadOptions.password = password;
        }
        pdfDoc = await PDFDocument.load(pdfBytes, loadOptions);
      } catch (error: any) {
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
      const fieldData: FieldInfo[] = [];

      for (const field of fields) {
        const fieldInfo: FieldInfo = {
          name: field.getName(),
          type: this.getFieldType(field),
          value: this.getFieldValue(field),
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

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
      throw error;
    }
  }

  /**
   * Fill form fields in a PDF with provided data
   */
  async fillFormFields(
    pdfPath: string, 
    data: Record<string, any>, 
    password: string | null = null
  ): Promise<PDFDocument> {
    try {
      // Check if file exists
      await fs.access(pdfPath);
      
      // Read PDF file
      const pdfBytes = await fs.readFile(pdfPath);
      
      // Load PDF document
      let pdfDoc: PDFDocument;
      try {
        const loadOptions: any = { ignoreEncryption: false };
        if (password) {
          loadOptions.password = password;
        }
        pdfDoc = await PDFDocument.load(pdfBytes, loadOptions);
      } catch (error: any) {
        if (error.message.includes('password') || error.message.includes('encrypted')) {
          throw new Error('PDF is password protected. Please provide the correct password.');
        }
        if (error.message.includes('Invalid PDF')) {
          throw new Error('Invalid or corrupted PDF file.');
        }
        throw error;
      }

      const form = pdfDoc.getForm();
      const filledFields: string[] = [];
      const errors: string[] = [];

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
        } catch (fieldError: any) {
          errors.push(`Error filling field '${fieldName}': ${fieldError.message}`);
        }
      }

      // Log results
      console.log(`Successfully filled ${filledFields.length} fields:`, filledFields);
      if (errors.length > 0) {
        console.warn('Field filling errors:', errors);
      }

      return pdfDoc;

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
      throw error;
    }
  }

  /**
   * Save a modified PDF document to a file
   */
  async saveFilledPDF(pdfDoc: PDFDocument, outputPath: string): Promise<string> {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Serialize the PDF document
      const pdfBytes = await pdfDoc.save();

      // Write to file
      await fs.writeFile(outputPath, pdfBytes);

      return outputPath;

    } catch (error: any) {
      throw new Error(`Failed to save PDF to ${outputPath}: ${error.message}`);
    }
  }

  /**
   * Extract all text content from a PDF
   */
  async extractFullText(
    pdfPath: string, 
    password: string | null = null
  ): Promise<TextExtractionResult> {
    try {
      // Check if file exists
      await fs.access(pdfPath);
      
      // Read PDF file
      const pdfBuffer = await fs.readFile(pdfPath);
      
      // Parse PDF with password if provided
      const options: any = {};
      if (password) {
        options.password = password;
      }

      let result: any;
      try {
        result = await pdfParse(pdfBuffer, options);
      } catch (error: any) {
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

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
      throw error;
    }
  }

  /**
   * Validate that required fields are filled in a PDF form
   */
  async validateForm(
    pdfPath: string, 
    requiredFields: string[], 
    password: string | null = null
  ): Promise<ValidationResult> {
    try {
      const fields = await this.readFormFields(pdfPath, password);
      const fieldMap = new Map(fields.map(field => [field.name, field]));
      
      const missingFields: string[] = [];
      const invalidFields: string[] = [];

      for (const requiredFieldName of requiredFields) {
        const field = fieldMap.get(requiredFieldName);
        
        if (!field) {
          invalidFields.push(`Field '${requiredFieldName}' does not exist in the PDF`);
          continue;
        }

        // Check if field has a value
        if (this.isFieldEmpty(field)) {
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
   */
  async getPDFInfo(pdfPath: string, password: string | null = null): Promise<PDFInfo> {
    try {
      const textInfo = await this.extractFullText(pdfPath, password);
      const fields = await this.readFormFields(pdfPath, password);

      return {
        path: pdfPath,
        pages: textInfo.pages,
        hasForm: fields.length > 0,
        fieldCount: fields.length,
        fieldTypes: this.groupFieldsByType(fields),
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
   */
  private getFieldType(field: PDFField): string {
    if (field instanceof PDFTextField) return 'text';
    if (field instanceof PDFCheckBox) return 'checkbox';
    if (field instanceof PDFRadioGroup) return 'radio';
    if (field instanceof PDFDropdown) return 'dropdown';
    if (field instanceof PDFSignature) return 'signature';
    return 'unknown';
  }

  /**
   * Get the current value of a PDF form field
   */
  private getFieldValue(field: PDFField): any {
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
    } catch (error: any) {
      console.warn(`Error getting value for field ${field.getName()}:`, error.message);
      return null;
    }
  }

  /**
   * Check if a field is empty or has no value
   */
  private isFieldEmpty(field: FieldInfo): boolean {
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
   */
  private groupFieldsByType(fields: FieldInfo[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const field of fields) {
      groups[field.type] = (groups[field.type] || 0) + 1;
    }
    return groups;
  }
}

export default PDFService;