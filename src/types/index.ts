// Core type definitions for PDF Filler Desktop

export interface PDFFormField {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature';
  value: string | boolean | null;
  required: boolean;
  options?: string[]; // For dropdown/radio fields
  page?: number;
}

export interface PDFAnalysisResult {
  type: 'form' | 'document' | 'mixed';
  pages: number;
  hasFormFields: boolean;
  formFields: PDFFormField[];
  summary: string;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

export interface PDFExtractionResult {
  [key: string]: any;
  formData?: Record<string, any>;
  textContent?: string;
  tables?: Array<Array<string>>;
}

export interface PDFValidationResult {
  isValid: boolean;
  missingFields: string[];
  filledFields: string[];
  allFields: string[];
  summary: string;
}

export interface FillInstruction {
  field: string;
  value: string | boolean;
  type: 'text' | 'checkbox' | 'dropdown' | 'radio';
}

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
}

export interface RateLimiter {
  requestsPerMinute: number;
  requestsToday: number;
  lastMinuteReset: number;
  lastDayReset: number;
}

export interface GeminiConfig {
  authType: 'oauth-personal' | 'api-key' | 'vertex-ai';
  configDir?: string;
  model?: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  apiKey?: string;
}

export interface ExtractOptions {
  pdfPath: string;
  template?: Record<string, unknown>;
  retryCount?: number;
  useConsensus?: boolean;
}

export interface ProfileData {
  id: string;
  name: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CSVProcessingOptions {
  csvPath: string;
  pdfTemplate: string;
  outputDir: string;
  mappings?: Record<string, string>;
}

export interface ProcessingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
}

// Electron IPC types
export interface IPCChannels {
  'auth-check': () => AuthStatus;
  'auth-start': () => void;
  'auth-clear': () => void;
  'auth-success': () => void;
  'auth-failure': (error: string) => void;
  'auth-terminal-opened': () => void;
  'auth-timeout': () => void;
  'server-status': (status: { running: boolean; port?: number }) => void;
  'pdf-analyzed': (result: PDFAnalysisResult) => void;
  'pdf-extracted': (result: PDFExtractionResult) => void;
  'error': (error: { message: string; code?: string }) => void;
}

// Server request/response types
export interface AnalyzeRequest {
  pdfPath?: string;
}

export interface ExtractRequest {
  pdfPath?: string;
  template?: Record<string, unknown>;
}

export interface FillRequest {
  pdfPath: string;
  data: Record<string, any>;
}

export interface ValidateRequest {
  pdfPath: string;
  requiredFields?: string[];
}

// Recent files tracking
export interface RecentFile {
  path: string;
  name: string;
  timestamp: number;
  type: 'analyzed' | 'extracted' | 'filled';
  result?: any;
}