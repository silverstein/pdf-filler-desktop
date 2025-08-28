import { GeminiCLIService } from './gemini-cli.service';
import path from 'path';

// Type definitions for quick intelligence
export interface QuickInsights {
  documentType: string;
  completeness: number;
  keyInsights: string[];
  nextActions: string[];
  warnings: string[];
}

export interface DocumentSummary {
  title: string;
  description: string;
  category: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  processingTips: string[];
}

export interface IntelligenceResult {
  summary: DocumentSummary;
  insights: QuickInsights;
  metadata: {
    analyzedAt: string;
    processingTime: number;
    confidence: number;
  };
}

/**
 * PDFIntelligenceService - Provides quick, actionable intelligence about PDFs
 * Focused on immediate value with low latency
 */
export class PDFIntelligenceService {
  private gemini: GeminiCLIService;
  private cache: Map<string, IntelligenceResult>;

  constructor() {
    this.gemini = new GeminiCLIService();
    this.cache = new Map();
  }

  /**
   * Get quick intelligence about a PDF - the main entry point
   */
  async getQuickIntelligence(pdfPath: string): Promise<IntelligenceResult> {
    const startTime = Date.now();
    const absolutePath = path.resolve(pdfPath);
    
    // Check cache first
    const cacheKey = `${absolutePath}_${Date.now() / 1000 / 60 / 5 | 0}`; // 5-minute cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Get both summary and insights in parallel for speed
      const [summary, insights] = await Promise.all([
        this.getDocumentSummary(absolutePath),
        this.getQuickInsights(absolutePath)
      ]);

      const result: IntelligenceResult = {
        summary,
        insights,
        metadata: {
          analyzedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          confidence: this.calculateConfidence(summary, insights)
        }
      };

      // Cache the result
      this.cache.set(cacheKey, result);
      
      // Clean old cache entries
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }

      return result;
    } catch (error: any) {
      console.error('Intelligence analysis failed:', error);
      return this.getFallbackIntelligence();
    }
  }

  /**
   * Get a quick document summary
   */
  private async getDocumentSummary(pdfPath: string): Promise<DocumentSummary> {
    const prompt = `Look at the PDF document at: ${pdfPath}

Quickly tell me:
1. What type of document is this? (Be specific - e.g., "IRS Schedule K-1 Tax Form" not just "tax form")
2. What is its main purpose?
3. How important/urgent is this document?
4. Any special handling tips?

Return ONLY a JSON object like this:
{
  "title": "Document Type Name",
  "description": "One sentence describing what this document is for",
  "category": "tax|legal|financial|business|personal|other",
  "importance": "critical|high|medium|low",
  "processingTips": ["tip 1", "tip 2", "tip 3"]
}`;

    try {
      // Use Pro model for better reasoning in intelligence analysis
      const response = await this.gemini.callGemini(prompt, true);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'Document',
          description: parsed.description || 'Document for processing',
          category: parsed.category || 'other',
          importance: parsed.importance || 'medium',
          processingTips: parsed.processingTips || []
        };
      }
    } catch (error) {
      console.error('Failed to get document summary:', error);
    }

    return {
      title: 'Document',
      description: 'Document ready for processing',
      category: 'other',
      importance: 'medium',
      processingTips: []
    };
  }

  /**
   * Get quick actionable insights
   */
  private async getQuickInsights(pdfPath: string): Promise<QuickInsights> {
    const prompt = `Look at the PDF document at: ${pdfPath}

Read the document and tell me:
1. The specific type of document (be precise)
2. Estimate what percentage of the document is filled out (0-100)
3. List 3-5 key facts or important data points from the document
4. Suggest 2-3 immediate actions the user should take
5. Note any warnings or issues you see

Format your response as JSON only:
{
  "documentType": "specific document name",
  "completeness": 85,
  "keyInsights": [
    "Key fact or data point 1",
    "Key fact or data point 2",
    "Key fact or data point 3"
  ],
  "nextActions": [
    "Action 1",
    "Action 2"
  ],
  "warnings": []
}`;

    try {
      // Use Pro model for better reasoning in intelligence analysis
      const response = await this.gemini.callGemini(prompt, true);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          documentType: parsed.documentType || 'Unknown Document',
          completeness: parsed.completeness || 0,
          keyInsights: parsed.keyInsights || [],
          nextActions: parsed.nextActions || [],
          warnings: parsed.warnings || []
        };
      }
    } catch (error) {
      console.error('Failed to get quick insights:', error);
    }

    return {
      documentType: 'Document',
      completeness: 0,
      keyInsights: ['Document loaded successfully'],
      nextActions: ['Review the document'],
      warnings: []
    };
  }

  /**
   * Get document type classification
   */
  async classifyDocument(pdfPath: string): Promise<string> {
    const absolutePath = path.resolve(pdfPath);
    
    const prompt = `Look at the PDF at: ${pdfPath}

What type of document is this? Be as specific as possible.
Common types include:
- Tax forms (W-2, 1099, K-1, 1040, etc.)
- Legal contracts (NDA, employment, lease, purchase agreement)
- Financial statements (bank statement, invoice, receipt, P&L)
- Applications (job, loan, rental, insurance)
- Government forms (passport, license, permit, registration)
- Medical records (lab results, prescription, insurance claim)
- Educational (transcript, diploma, certificate)

Return ONLY the document type as a short string, like "IRS Form 1040" or "Rental Lease Agreement"`;

    try {
      // Use Pro model for better document classification
      const response = await this.gemini.callGemini(prompt, true);
      // Clean up the response - take first line, remove quotes
      const type = response.split('\n')[0].replace(/['"]/g, '').trim();
      return type || 'Unknown Document';
    } catch (error) {
      console.error('Failed to classify document:', error);
      return 'Unknown Document';
    }
  }

  /**
   * Validate document completeness
   */
  async validateCompleteness(pdfPath: string): Promise<{
    complete: boolean;
    percentage: number;
    missingFields: string[];
    suggestions: string[];
  }> {
    const absolutePath = path.resolve(pdfPath);
    
    const prompt = `Check the PDF at: ${pdfPath}

Analyze how complete this document is:
1. What percentage of fields/sections are filled out?
2. What important fields or sections are missing?
3. What should be done to complete this document?

Return ONLY a JSON object:
{
  "complete": false,
  "percentage": 75,
  "missingFields": ["field1", "field2"],
  "suggestions": ["Fill in missing SSN", "Add signature", "Include date"]
}`;

    try {
      // Use Pro model for better completeness analysis
      const response = await this.gemini.callGemini(prompt, true);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to validate completeness:', error);
    }

    return {
      complete: false,
      percentage: 0,
      missingFields: [],
      suggestions: ['Review document for completeness']
    };
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(summary: DocumentSummary, insights: QuickInsights): number {
    let confidence = 50; // Base confidence
    
    // Increase confidence based on data quality
    if (summary.title !== 'Document') confidence += 10;
    if (summary.category !== 'other') confidence += 10;
    if (insights.keyInsights.length >= 3) confidence += 10;
    if (insights.nextActions.length >= 2) confidence += 10;
    if (insights.completeness > 0) confidence += 10;
    
    return Math.min(confidence, 95); // Cap at 95%
  }

  /**
   * Fallback intelligence when analysis fails
   */
  private getFallbackIntelligence(): IntelligenceResult {
    return {
      summary: {
        title: 'Document',
        description: 'Document ready for processing',
        category: 'other',
        importance: 'medium',
        processingTips: ['Document loaded successfully']
      },
      insights: {
        documentType: 'Document',
        completeness: 0,
        keyInsights: ['Document is ready for analysis'],
        nextActions: ['Use Extract or Analyze features for more details'],
        warnings: []
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        processingTime: 0,
        confidence: 0
      }
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export default PDFIntelligenceService;