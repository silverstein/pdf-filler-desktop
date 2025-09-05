import { GeminiCLIService } from './gemini-cli.service';
import CodexCLIService from './codex-cli.service';
import CodexAIService from './codex-ai.service';
import { PDFService } from './pdf-service';
import { getExtract, setExtract, getInFlight as getExtractInFlight, setInFlight as setExtractInFlight, clearInFlight as clearExtractInFlight } from './extract-cache';
import { 
  getIntelligence, 
  setIntelligence, 
  clearIntelligence, 
  getInFlight as getIntelInFlight, 
  setInFlight as setIntelInFlight, 
  clearInFlight as clearIntelInFlight 
} from './intelligence-cache';
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
    provider?: 'gemini' | 'chatgpt';
    mode?: 'codex-structured' | 'codex-short' | 'heuristic' | 'gemini' | 'extract-first';
  };
}

/**
 * PDFIntelligenceService - Provides quick, actionable intelligence about PDFs
 * Focused on immediate value with low latency
 */
export class PDFIntelligenceService {
  private gemini: GeminiCLIService;
  private codex: CodexCLIService;
  private pdf: PDFService;
  private codexAI: CodexAIService;

  constructor() {
    this.gemini = new GeminiCLIService();
    this.codex = new CodexCLIService();
    this.pdf = new PDFService();
    this.codexAI = new CodexAIService();
  }

  /**
   * Get quick intelligence about a PDF - the main entry point
   */
  async getQuickIntelligence(pdfPath: string, forceRefresh: boolean = false): Promise<IntelligenceResult> {
    const startTime = Date.now();
    // Unified overall budget: default 120s (configurable via INTEL_BUDGET_MS)
    const budgetMs = Number(process.env.INTEL_BUDGET_MS || 120000);
    const absolutePath = path.resolve(pdfPath);
    
    // Check persistent cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getIntelligence(absolutePath);
      if (cached) {
        console.log('[Intelligence] Using persistent cache for', absolutePath);
        return cached.data;
      }
      
      // Check if analysis is already in-flight
      const inFlight = getIntelInFlight(absolutePath);
      if (inFlight) {
        console.log('[Intelligence] Attaching to in-flight analysis for', absolutePath);
        return inFlight;
      }
    }

    // Create and register the analysis promise
    const analysisPromise = this.performIntelligenceAnalysis(absolutePath, budgetMs, startTime);
    setIntelInFlight(absolutePath, analysisPromise);
    
    try {
      const result = await analysisPromise;
      return result;
    } finally {
      clearIntelInFlight(absolutePath);
    }
  }

  private async performIntelligenceAnalysis(
    absolutePath: string,
    budgetMs: number,
    startTime: number
  ): Promise<IntelligenceResult> {
    const remaining = () => budgetMs - (Date.now() - startTime);
    const log = (...args: any[]) => {
      try {
        const elapsed = Date.now() - startTime;
        console.log(`[Intelligence +${elapsed}ms]`, ...args);
      } catch {}
    };
    const timing: Record<string, number> = {};

    try {
      // Prefer a single Codex pass when ChatGPT is authenticated and Gemini is not
      const [codexOk, geminiOk] = await Promise.all([
        this.codex.checkAuthStatus(),
        this.gemini.checkAuthStatus()
      ]);

      if (codexOk && !geminiOk) {
        const quickOnly = process.env.INTEL_QUICK_ONLY === '1' || budgetMs <= 45000;
        log('Using Codex (ChatGPT) extract-first', quickOnly ? '(quick-only)' : '');

        // 1) Local PDF text + fields (fast)
        const tReadStart = Date.now();
        const textData = await this.pdf.extractFullTextPdfjs(absolutePath);
        let fields: any[] = [];
        try { fields = await this.pdf.readFormFields(absolutePath); } catch {}
        timing.readMs = Date.now() - tReadStart;
        log(`readText+fieldsMs=${timing.readMs}`);

        // QUICK MODE: skip extract for predictable sub-45s latency
        if (quickOnly) {
          try {
            const limited = this.preprocessTextForIntelligence(textData.text || '', 9000);
            const codexPrompt = `Return ONLY valid JSON: {"summary":{"title":"...","description":"...","category":"tax|legal|financial|business|personal|other","importance":"critical|high|medium|low","processingTips":["...","..."]},"insights":{"documentType":"...","completeness":0-100,"keyInsights":["...","..."],"nextActions":["...","..."],"warnings":[]}}\nText:\n${limited}`;
            const tSummarizeStart = Date.now();
            const raw = await this.codex.callCodex(codexPrompt, { timeoutMs: Math.min(25000, Math.max(8000, remaining())) });
            timing.summarizeMs = Date.now() - tSummarizeStart;
            log(`summarizeMs=${timing.summarizeMs}`);
            const parsed = this.parseJSONFromLLM(raw);
            if (parsed && parsed.summary && parsed.insights) {
              const s = this.normalizeSummary(parsed.summary);
              let i = this.normalizeInsights(parsed.insights);
              if (fields && fields.length) i.completeness = this.computeFormCompleteness(fields);
              const combined: IntelligenceResult = {
                summary: s,
                insights: i,
                metadata: {
                  analyzedAt: new Date().toISOString(),
                  processingTime: Date.now() - startTime,
                  confidence: this.calculateConfidence(s, i),
                  provider: 'chatgpt',
                  mode: 'codex-short'
                }
              };
              setIntelligence(absolutePath, combined);
              return combined;
            }
          } catch {}
          const quick = this.quickHeuristicIntelligence(absolutePath, textData.text || '', fields, Date.now() - startTime);
          quick.metadata.provider = 'chatgpt';
          quick.metadata.mode = 'heuristic';
          setIntelligence(absolutePath, quick);
          return quick;
        }

        // 2) extract-first: prefer cached, else attach to in-flight, else start new extraction with unified timeout
        let extractObj: any | null | undefined = getExtract(absolutePath)?.data;

        if (extractObj) {
          log('extract cache hit');
        } else {
          const attached = getExtractInFlight(absolutePath);
          if (attached) {
            log('attach to in-flight extract');
            try {
              extractObj = await attached;
            } catch {
              extractObj = null;
            }
          }
        }

        if (!extractObj) {
          const rem = remaining();
          // Leave a small tail budget; unify per-step timeout up to 120s (configurable)
          const maxExtract = Number(process.env.INTEL_EXTRACT_TIMEOUT_MS || 120000);
          const timeoutForExtract = Math.min(maxExtract, Math.max(10000, rem - 3000));
          if (timeoutForExtract <= 3000) {
            log('skip extract (insufficient remaining budget)');
          } else {
            log(`start extract (timeoutMs=${timeoutForExtract})`);
            const p = this.codexAI.extractFromText(textData.text || '', undefined, { timeoutMs: timeoutForExtract });
            setExtractInFlight(absolutePath, p);
            const tExtractStart = Date.now();
            try {
              extractObj = await p;
              timing.extractMs = Date.now() - tExtractStart;
              log(`extractMs=${timing.extractMs}`);
            } catch (e: any) {
              timing.extractMs = Date.now() - tExtractStart;
              log(`extract failed after ${timing.extractMs}ms:`, e?.message || e);
              extractObj = null;
            } finally {
              clearExtractInFlight(absolutePath);
            }
            if (extractObj) {
              setExtract(absolutePath, { data: extractObj, at: Date.now(), provider: 'chatgpt' });
            }
          }
        }

        // 3) On success, deterministically summarize from extract (guarantees specificity)
        if (extractObj) {
          const tBuildStart = Date.now();
          const result = this.buildIntelligenceFromExtract(absolutePath, extractObj, fields, Date.now() - startTime);
          timing.buildMs = Date.now() - tBuildStart;
          log(`buildIntelligenceMs=${timing.buildMs}`);
          log('Timing summary:', timing);
          // Ensure consistent provider/mode
          result.metadata.provider = 'chatgpt';
          result.metadata.mode = 'extract-first';
          setIntelligence(absolutePath, result);
          return result;
        }

        // 4) If extract failed or timed out, try a short summarize path
        try {
          const limited = this.preprocessTextForIntelligence(textData.text || '', 9000);
          const codexPrompt = `Return ONLY valid JSON: {"summary":{"title":"...","description":"...","category":"tax|legal|financial|business|personal|other","importance":"critical|high|medium|low","processingTips":["...","..."]},"insights":{"documentType":"...","completeness":0-100,"keyInsights":["...","..."],"nextActions":["...","..."],"warnings":[]}}\nText:\n${limited}`;
          const tFallbackStart = Date.now();
          const raw = await this.codex.callCodex(codexPrompt, { timeoutMs: Math.min(25000, Math.max(8000, remaining())) });
          timing.fallbackMs = Date.now() - tFallbackStart;
          log(`fallbackSummarizeMs=${timing.fallbackMs}`);
          const parsed = this.parseJSONFromLLM(raw);
          if (parsed && parsed.summary && parsed.insights) {
            const s = this.normalizeSummary(parsed.summary);
            let i = this.normalizeInsights(parsed.insights);
            if (fields && fields.length) i.completeness = this.computeFormCompleteness(fields);
            const combined: IntelligenceResult = {
              summary: s,
              insights: i,
              metadata: {
                analyzedAt: new Date().toISOString(),
                processingTime: Date.now() - startTime,
                confidence: this.calculateConfidence(s, i),
                provider: 'chatgpt',
                mode: 'codex-short'
              }
            };
            setIntelligence(absolutePath, combined);
            return combined;
          }
        } catch {}

        // 5) Heuristic fallback
        const quick = this.quickHeuristicIntelligence(absolutePath, textData.text || '', fields, Date.now() - startTime);
        quick.metadata.provider = 'chatgpt';
        quick.metadata.mode = 'heuristic';
        setIntelligence(absolutePath, quick);
        return quick;
      }

      // Gemini path unchanged
      const [summary, insights] = await Promise.all([
        this.getDocumentSummary(absolutePath),
        this.getQuickInsights(absolutePath)
      ]);

      let result: IntelligenceResult = {
        summary,
        insights,
        metadata: {
          analyzedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          confidence: this.calculateConfidence(summary, insights),
          provider: 'gemini',
          mode: 'gemini'
        }
      };

      // Quality gate (Codex refine only if Gemeni unavailable; keep provider/mode consistent if used)
      const maybeWeak = (
        (!summary?.title || summary.title === 'Document') &&
        (insights?.keyInsights?.length || 0) < 2
      );
      if (maybeWeak) {
        try {
          const codexOk2 = await this.codex.checkAuthStatus();
          const geminiOk2 = await this.gemini.checkAuthStatus();
          if (codexOk2 && !geminiOk2) {
            const textData = await this.pdf.extractFullTextPdfjs(absolutePath);
            const limited = (textData.text || '').slice(0, 14000);
            const refinePrompt = `You are improving a weak analysis for a PDF. Here is the extracted text (truncated):\n\n${limited}\n\n` +
              `Return ONLY valid JSON with:\n` +
              `{"summary":{"title":"...","description":"...","category":"tax|legal|financial|business|personal|other","importance":"critical|high|medium|low","processingTips":["...","..."]},` +
              `"insights":{"documentType":"...","completeness":0-100,"keyInsights":["...","...","..."],"nextActions":["...","..."],"warnings":[]}}`;
            const raw = await this.codex.callCodex(refinePrompt);
            const parsed = this.parseJSONFromLLM(raw);
            if (parsed && parsed.summary && parsed.insights) {
              const s2 = this.normalizeSummary(parsed.summary);
              const i2 = this.normalizeInsights(parsed.insights);
              result = {
                summary: s2,
                insights: i2,
                metadata: {
                  analyzedAt: new Date().toISOString(),
                  processingTime: Date.now() - startTime,
                  confidence: this.calculateConfidence(s2, i2),
                  provider: 'chatgpt',
                  mode: 'codex-short'
                }
              };
            }
          }
        } catch {}
      }

      // Cache and return
      setIntelligence(absolutePath, result);
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
      // Prefer Codex when authenticated and Gemini is not
      const [codexOk, geminiOk] = await Promise.all([
        this.codex.checkAuthStatus(),
        this.gemini.checkAuthStatus()
      ]);

      let response: string;
      if (codexOk && !geminiOk) {
        // Try structured extract -> summarize path
        const textData = await this.pdf.extractFullTextPdfjs(pdfPath);
        const extract = await this.codexAI.extractFromText(textData.text || '');
        if (extract) {
          const obj = await this.codexAI.generateIntelligenceFromExtract(extract);
          if (obj && obj.summary) return this.normalizeSummary(obj.summary);
        }
        // Fallback to summarize from text
        let fields: any[] = [];
        try { fields = await this.pdf.readFormFields(pdfPath); } catch {}
        const aiObj = await this.codexAI.generateIntelligenceFromText(textData.text || '', fields);
        if (aiObj && aiObj.summary) return this.normalizeSummary(aiObj.summary);
        // Final fallback via CLI prompt
        const limited = (textData.text || '').slice(0, 12000);
        const codexPrompt = `You are analyzing a PDF. Here is the extracted text (truncated if long):\n\n${limited}\n\n` +
          `Return ONLY valid JSON with keys: { "title": "...", "description": "...", "category": "tax|legal|financial|business|personal|other", "importance": "critical|high|medium|low", "processingTips": ["...","..."] }.`;
        response = await this.codex.callCodex(codexPrompt);
      } else {
        // Use Pro model for better reasoning in intelligence analysis
        response = await this.gemini.callGemini(prompt, true);
      }
      const parsed = this.parseJSONFromLLM(response);
      if (parsed) return this.normalizeSummary(parsed);
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
2. Estimate what percentage of the document is filled out (0-100 as a number)
3. List 3-5 key facts or important data points from the document
4. Suggest 2-3 immediate actions the user should take
5. Note any warnings or issues you see

Return ONLY valid JSON:
{
  "documentType": "specific document name",
  "completeness": 85,
  "keyInsights": ["..."],
  "nextActions": ["..."],
  "warnings": []
}`;

    try {
      const [codexOk, geminiOk] = await Promise.all([
        this.codex.checkAuthStatus(),
        this.gemini.checkAuthStatus()
      ]);
      let response: string;
      if (codexOk && !geminiOk) {
        const textData = await this.pdf.extractFullTextPdfjs(pdfPath);
        let fields: any[] = [];
        try { fields = await this.pdf.readFormFields(pdfPath); } catch {}
        const aiObj = await this.codexAI.generateIntelligenceFromText(textData.text || '', fields);
        if (aiObj && aiObj.insights) {
          let ins = this.normalizeInsights(aiObj.insights);
          // Override completeness deterministically if fields exist
          if (fields && fields.length) ins.completeness = this.computeFormCompleteness(fields);
          return ins;
        }
        // Fallback
        const limited = (textData.text || '').slice(0, 12000);
        const codexPrompt = `Given this PDF text (truncated if long):\n\n${limited}\n\n` +
          `Return ONLY valid JSON with: { "documentType": "...", "completeness": 0-100, "keyInsights": ["..."], "nextActions": ["..."], "warnings": [] }.`;
        response = await this.codex.callCodex(codexPrompt);
      } else {
        // Use Pro model for better reasoning in intelligence analysis
        response = await this.gemini.callGemini(prompt, true);
      }
      const parsed = this.parseJSONFromLLM(response);
      if (parsed) return this.normalizeInsights(parsed);
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
   * Best-effort JSON extraction from LLM output.
   */
  private parseJSONFromLLM(output: string): any | null {
    try {
      if (!output) return null;
      // Prefer fenced blocks
      const fence = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
      let text = fence ? fence[1] : output;
      // Sanitize common issues
      text = text.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
      text = text.replace(/<\s*0-100\s*>/g, '0');
      // Try direct curly extraction with brace balancing
      let start = text.indexOf('{');
      if (start === -1) return null;
      let depth = 0; let inStr = false; let esc = false; let end = -1;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const jsonStr = end !== -1 ? text.slice(start, end + 1) : text;
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  private normalizeSummary(parsed: any): DocumentSummary {
    const pickImportance = (v: any): 'critical'|'high'|'medium'|'low' => {
      const s = String(v || '').toLowerCase();
      if (s.includes('|')) return 'medium';
      if (s.includes('critical')) return 'critical';
      if (s.includes('high')) return 'high';
      if (s.includes('low')) return 'low';
      if (s.includes('medium')) return 'medium';
      return 'medium';
    };
    const pickCategory = (v: any): string => {
      const s = String(v || '').toLowerCase();
      const allowed = ['tax','legal','financial','business','personal','other'];
      for (const a of allowed) if (s.includes(a)) return a;
      if (s.includes('|')) return 'other';
      return s || 'other';
    };
    const clean = (s: any): string => {
      const t = String(s || '').trim();
      if (!t || t === '...' || t === '—' || t === '-') return '';
      return t;
    };
    return {
      title: clean(parsed?.title) || 'Document',
      description: clean(parsed?.description) || 'Document ready for processing',
      category: pickCategory(parsed?.category),
      importance: pickImportance(parsed?.importance),
      processingTips: Array.isArray(parsed?.processingTips)
        ? parsed.processingTips.map(clean).filter(Boolean)
        : []
    };
  }

  private normalizeInsights(parsed: any): QuickInsights {
    const clean = (s: any): string => {
      const t = String(s || '').trim();
      if (!t || t === '...' || t.toLowerCase() === 'tip1' || t.toLowerCase() === 'tip2') return '';
      return t;
    };
    let completeness = parsed?.completeness;
    if (typeof completeness === 'string') completeness = parseInt(completeness.replace(/[^0-9]/g,''), 10);
    if (!Number.isFinite(completeness)) completeness = 0;
    completeness = Math.max(0, Math.min(100, completeness));
    return {
      documentType: clean(parsed?.documentType) || 'Document',
      completeness,
      keyInsights: Array.isArray(parsed?.keyInsights) ? parsed.keyInsights.map(clean).filter(Boolean) : [],
      nextActions: Array.isArray(parsed?.nextActions) ? parsed.nextActions.map(clean).filter(Boolean) : [],
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(clean).filter(Boolean) : []
    };
  }

  private computeFormCompleteness(fields: any[]): number {
    if (!Array.isArray(fields) || fields.length === 0) return 0;
    const isFilled = (f: any): boolean => {
      const type = String(f?.type || '').toLowerCase();
      const v = f?.value;
      if (v === null || v === undefined) return false;
      switch (type) {
        case 'text': return String(v).trim().length > 0;
        case 'checkbox': return v === true;
        case 'radio':
        case 'dropdown': return String(v).trim().length > 0;
        default: return String(v).trim().length > 0;
      }
    };
    const filled = fields.reduce((acc: number, f: any) => acc + (isFilled(f) ? 1 : 0), 0);
    return Math.round((filled / fields.length) * 100);
  }

  private buildIntelligenceFromExtract(pdfPath: string, extractObj: any, fields: any[], processingMs: number): IntelligenceResult {
    // Flatten keys for pattern detection
    const flat: Array<{ path: string; value: any }> = [];
    const walk = (obj: any, pfx: string[] = []) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const np = [...pfx, k];
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, np);
        else flat.push({ path: np.join('.'), value: v });
      }
    };
    walk(extractObj);
    const findVal = (keys: string[]): string => {
      const lc = keys.map(k => k.toLowerCase());
      for (const { path, value } of flat) {
        const p = path.toLowerCase();
        if (lc.some(k => p.includes(k))) {
          const s = String(value ?? '').trim();
          if (s) return s;
        }
      }
      return '';
    };
    const findAll = (keys: string[]): string[] => {
      const out: string[] = [];
      const lc = keys.map(k => k.toLowerCase());
      for (const { path, value } of flat) {
        const p = path.toLowerCase();
        if (lc.some(k => p.includes(k))) {
          const s = String(value ?? '').trim();
          if (s) out.push(s);
        }
      }
      return Array.from(new Set(out));
    };

    // Detect category and title
    const text = JSON.stringify(extractObj).toLowerCase();
    const has = (s: string) => text.includes(s);
    let category: 'tax'|'legal'|'financial'|'business'|'personal'|'other' = 'other';
    let title = 'Document';
    if (has('trust') || has('executor') || has('guardianship') || has('will')) {
      category = 'legal';
      title = has('will') ? 'Last Will and Testament' : (has('trust') ? 'Revocable Living Trust (Estate Plan)' : 'Estate Plan');
    } else if (has('irs') || has('schedule') || has('1040') || has('k-1')) {
      category = 'tax';
      title = 'Tax Form';
    } else if (has('invoice') || has('statement') || has('account')) {
      category = 'financial';
      title = 'Financial Statement';
    }

    // Pull specific signals based on document category
    const keyInsights: string[] = [];
    const nextActions: string[] = [];
    
    if (category === 'legal') {
      // Legal document signals
      const trustName = findVal(['trust.name','trust_title','revocable trust','trust_name']);
      const executor = findVal(['will.executor.primary','executor.name','executor.primary']);
      const altExecutor = findVal(['will.executor.alternate','alternate_executor','executor.alternate']);
      const successorTrustee = findVal(['successor_trustee','trust.successor_trustee','trustee.successor']);
      const primaryGuardian = findVal(['guardianship.primary_guardian','guardian.primary']);
      const alternateGuardian = findVal(['guardianship.alternate_guardian','guardian.alternate']);
      const preparedDate = findVal(['prepared_date','date_prepared','document_date']);
      const donations = findAll(['charitable','donation','charitable_donation']);
      const distributions = findAll(['distribution','beneficiaries','bequest']);
      
      if (trustName) keyInsights.push(`Trust: ${trustName}`);
      if (executor) keyInsights.push(`Executor: ${executor}${altExecutor ? `; Alternate: ${altExecutor}` : ''}`);
      if (successorTrustee) keyInsights.push(`Successor trustee: ${successorTrustee}`);
      if (primaryGuardian) keyInsights.push(`Guardian: ${primaryGuardian}${alternateGuardian ? `; Alternate: ${alternateGuardian}` : ''}`);
      if (preparedDate) keyInsights.push(`Prepared on ${preparedDate}`);
      if (donations.length) keyInsights.push(`Charitable donation noted (${donations[0]})`);
      if (distributions.length) keyInsights.push('Distributions/beneficiaries specified');
      
      if (!altExecutor && executor) nextActions.push('Fill in an alternate executor');
      if (!alternateGuardian && primaryGuardian) nextActions.push('Name an alternate guardian');
      nextActions.push('Share copies with executor, trustee, and guardians');
      nextActions.push('Review every 3 years or after major life events');
      
    } else if (category === 'financial') {
      // Financial document signals
      const accountNumber = findVal(['account','account_number','account_no']);
      const statementDate = findVal(['statement_date','date','period','statement_period']);
      const balance = findVal(['balance','ending_balance','current_balance','total']);
      const transactions = findAll(['transaction','deposit','withdrawal','payment','debit','credit']);
      const fees = findAll(['fee','charge','service_charge']);
      const interest = findVal(['interest','interest_earned','apy','apr']);
      const amounts = findAll(['amount','$','total','balance']).filter(s => /\$?\d/.test(s)).slice(0,5);
      
      if (accountNumber) keyInsights.push(`Account: ${accountNumber.replace(/\d(?=\d{4})/g, '*')}`); // Mask account number
      if (statementDate) keyInsights.push(`Statement period: ${statementDate}`);
      if (balance) keyInsights.push(`Balance: ${balance}`);
      if (transactions.length) keyInsights.push(`${transactions.length} transactions found`);
      if (fees.length) keyInsights.push(`Fees/charges detected`);
      if (interest) keyInsights.push(`Interest rate: ${interest}`);
      if (amounts.length && !balance) keyInsights.push(`Key amounts: ${amounts.slice(0,3).join(', ')}`);
      
      nextActions.push('Review transactions for accuracy');
      nextActions.push('Check for unauthorized charges');
      nextActions.push('Reconcile with your records');
      if (fees.length) nextActions.push('Review fees and consider options to reduce them');
      
    } else if (category === 'tax') {
      // Tax document signals
      const taxYear = findVal(['tax_year','year','2023','2024','2025']);
      const ein = findVal(['ein','employer_identification','tax_id']);
      const ssn = findVal(['ssn','social_security','taxpayer_id']);
      const income = findVal(['income','wages','salary','gross_income','adjusted_gross']);
      const deductions = findAll(['deduction','expense','credit']);
      const refund = findVal(['refund','overpayment']);
      const owed = findVal(['amount_owed','balance_due','tax_due']);
      
      if (taxYear) keyInsights.push(`Tax year: ${taxYear}`);
      if (ein) keyInsights.push(`EIN: ${ein.replace(/\d(?=\d{2})/g, '*')}`); // Mask EIN
      if (ssn) keyInsights.push(`SSN: ***-**-${ssn.slice(-4)}`); // Show only last 4 of SSN
      if (income) keyInsights.push(`Income reported: ${income}`);
      if (deductions.length) keyInsights.push(`${deductions.length} deductions/credits found`);
      if (refund) keyInsights.push(`Refund: ${refund}`);
      if (owed) keyInsights.push(`Amount owed: ${owed}`);
      
      nextActions.push('Verify all information is accurate');
      nextActions.push('Keep for your tax records');
      if (owed) nextActions.push('Make payment by the deadline');
      if (refund) nextActions.push('Track refund status');
      
    } else {
      // Generic document - try to extract any valuable info
      const dates = findAll(['date','dated','created','modified','prepared']);
      const names = findAll(['name','person','individual','party']);
      const amounts = findAll(['amount','$','total','value']).filter(s => /\$?\d/.test(s)).slice(0,3);
      const ids = findAll(['id','number','reference','code']);
      
      if (dates.length) keyInsights.push(`Date information: ${dates[0]}`);
      if (names.length) keyInsights.push(`Names found: ${names.slice(0,2).join(', ')}`);
      if (amounts.length) keyInsights.push(`Key amounts: ${amounts.join(', ')}`);
      if (ids.length) keyInsights.push(`Reference: ${ids[0]}`);
      
      // Try to extract more from the raw data
      const keys = Object.keys(extractObj).slice(0, 10);
      if (keys.length > 0 && keyInsights.length < 3) {
        keys.forEach(key => {
          const val = extractObj[key];
          if (val && typeof val !== 'object' && String(val).length < 50 && keyInsights.length < 5) {
            keyInsights.push(`${key}: ${val}`);
          }
        });
      }
      
      nextActions.push('Review the extracted data below');
      nextActions.push('Verify all information is correct');
    }
    
    // Ensure we always have something meaningful
    if (!keyInsights.length) {
      // Last resort - show the first few non-null values from extract
      const simpleVals = flat.filter(f => f.value && String(f.value).length < 100).slice(0, 3);
      simpleVals.forEach(f => keyInsights.push(`${f.path}: ${f.value}`));
      if (!keyInsights.length) keyInsights.push('Document processed successfully');
    }
    
    if (!nextActions.length) {
      nextActions.push('Review the document for accuracy');
    }

    const processingTips: string[] = [];
    if (category === 'legal') {
      processingTips.push('Confirm names and roles (executor/trustee/guardian)');
      processingTips.push('Store originals safely; share copies with named parties');
    }

    const importance: 'critical'|'high'|'medium'|'low' = (category === 'legal' || category === 'tax') ? 'high' : 'medium';
    const description = category === 'legal' ? 'Legal document related to estate planning' : (category === 'tax' ? 'Tax-related form' : 'Document ready for processing');
    let completeness = 0;
    if (fields && fields.length) completeness = this.computeFormCompleteness(fields);

    const summary: DocumentSummary = { title, description, category, importance, processingTips };
    const insights: QuickInsights = { documentType: title, completeness, keyInsights, nextActions, warnings: [] };
    return {
      summary,
      insights,
      metadata: {
        analyzedAt: new Date().toISOString(),
        processingTime: processingMs,
        confidence: this.calculateConfidence(summary, insights),
        provider: 'chatgpt',
        mode: 'extract-first'
      }
    };
  }

  private quickHeuristicIntelligence(pdfPath: string, text: string, fields: any[], processingMs: number = 0): IntelligenceResult {
    const t = `${path.basename(pdfPath)}\n${text}`.toLowerCase();
    const has = (s: string) => t.includes(s);
    let category: 'tax'|'legal'|'financial'|'business'|'personal'|'other' = 'other';
    let title = 'Document';
    const tips: string[] = [];
    if (has('estate') || has('trust') || has('will') || has('executor') || has('guardianship')) {
      category = 'legal';
      title = has('will') ? 'Last Will and Testament' : (has('trust') ? 'Revocable Living Trust (Estate Plan)' : 'Estate Plan');
      tips.push('Confirm names and roles (executor/trustee/guardian)');
      tips.push('Store originals safely; share copies with named parties');
    } else if (has('irs') || has('1040') || has('schedule') || has('k-1') || has('form ')) {
      category = 'tax';
      title = 'Tax Form';
      tips.push('Verify SSN/EIN and filing year');
      tips.push('Check signatures and required attachments');
    } else if (has('invoice') || has('statement') || has('account') || has('balance')) {
      category = 'financial';
      title = 'Financial Statement';
      tips.push('Verify amounts, dates, and account identifiers');
    }
    const desc = category === 'legal'
      ? 'Legal document related to estate planning'
      : category === 'tax'
      ? 'Tax-related government form'
      : category === 'financial'
      ? 'Financial record or statement'
      : 'Document ready for processing';
    const importance: 'critical'|'high'|'medium'|'low' = category === 'legal' || category === 'tax' ? 'high' : 'medium';
    const completeness = fields && fields.length ? this.computeFormCompleteness(fields) : 0;
    const insights: QuickInsights = {
      documentType: title,
      completeness,
      keyInsights: [],
      nextActions: tips.length ? tips.slice(0,2) : ['Review the document'],
      warnings: []
    };
    const summary: DocumentSummary = {
      title,
      description: desc,
      category,
      importance,
      processingTips: tips
    };
    return {
      summary,
      insights,
      metadata: {
        analyzedAt: new Date().toISOString(),
        processingTime: processingMs,
        confidence: this.calculateConfidence(summary, insights),
        provider: 'chatgpt',
        mode: 'heuristic'
      }
    };
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
   * Preprocess text to reduce tokens: remove duplicates, collapse whitespace
   */
  private preprocessTextForIntelligence(text: string, maxChars: number): string {
    const lines = text.split(/\r?\n/);
    const seen = new Set<string>();
    const dedupedLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim().replace(/\s+/g, ' ');
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        dedupedLines.push(trimmed);
      }
    }
    
    return dedupedLines.join('\n').slice(0, maxChars);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    clearIntelligence();
  }
}

export default PDFIntelligenceService;
