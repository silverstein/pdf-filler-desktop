import { z } from 'zod';
import CodexCLIService from './codex-cli.service';

export interface IntelligenceSummary {
  title: string;
  description: string;
  category: 'tax' | 'legal' | 'financial' | 'business' | 'personal' | 'other';
  importance: 'critical' | 'high' | 'medium' | 'low';
  processingTips: string[];
}

export interface IntelligenceInsights {
  documentType: string;
  completeness: number; // 0-100
  keyInsights: string[];
  nextActions: string[];
  warnings: string[];
}

export interface IntelligenceObject {
  summary: IntelligenceSummary;
  insights: IntelligenceInsights;
}

export class CodexAIService {
  private cli = new CodexCLIService();

  private preprocessText(text: string, maxChars: number = 16000): string {
    // Remove duplicate lines and collapse whitespace
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
    
    // Join and truncate to maxChars
    const processed = dedupedLines.join('\n').slice(0, maxChars);
    
    if (process.env.DEBUG_CODEX === '1') {
      const reduction = ((1 - processed.length / text.length) * 100).toFixed(1);
      console.log(`[CodexAI] Text preprocessing: ${text.length} → ${processed.length} chars (-${reduction}%)`);
    }
    
    return processed;
  }

  private getSchema() {
    const summary = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      category: z.enum(['tax','legal','financial','business','personal','other']),
      importance: z.enum(['critical','high','medium','low']),
      processingTips: z.array(z.string().min(1)).max(5)
    });
    const insights = z.object({
      documentType: z.string().min(1),
      completeness: z.number().min(0).max(100),
      keyInsights: z.array(z.string().min(1)).min(1).max(8),
      nextActions: z.array(z.string().min(1)).min(1).max(6),
      warnings: z.array(z.string()).max(6)
    });
    return z.object({ summary, insights });
  }

  private buildPrompt(text: string, fields: any[], errors?: string): string {
    const examples = this.getFewShotExamples();
    const shape = `{
  "summary": {
    "title": "string",
    "description": "string",
    "category": "tax|legal|financial|business|personal|other",
    "importance": "critical|high|medium|low",
    "processingTips": ["string", "string"]
  },
  "insights": {
    "documentType": "string",
    "completeness": 0-100,
    "keyInsights": ["string", "string"],
    "nextActions": ["string", "string"],
    "warnings": ["string"]
  }
}`;
    return (
      'You are a precise document analyst. Return ONLY valid JSON that matches the shape below. ' +
      'Do not include placeholders (e.g., "tip1", "...", option lists). Choose a single category and importance.\n\n' +
      examples + '\n' +
      (fields && fields.length ? `Form fields (name:type:value): ${JSON.stringify(fields).slice(0, 6000)}\n\n` : '') +
      `Text (truncated if long):\n${text.slice(0, 16000)}\n\n` +
      `JSON shape: ${shape}` +
      (errors ? `\n\nYour previous output failed validation due to: ${errors}. Produce corrected JSON now.` : '')
    );
  }

  private parseAndValidate(raw: string, schema: z.ZodSchema): { ok: true; object: any } | { ok: false; error: string } {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let text = fence ? fence[1] : raw;
    text = text.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
    // Attempt to extract first balanced JSON block
    const start = text.indexOf('{');
    if (start === -1) return { ok: false, error: 'No JSON object found' } as const;
    let depth = 0; let inStr = false; let esc = false; let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const jsonStr = end !== -1 ? text.slice(start, end + 1) : text;
    try {
      const parsed = JSON.parse(jsonStr);
      const res = schema.safeParse(parsed);
      if (res.success) return { ok: true, object: res.data } as const;
      return { ok: false, error: res.error?.message || 'Schema validation failed' } as const;
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Invalid JSON' } as const;
    }
  }

  /**
   * Structured generation using Codex CLI under the hood with zod validation and one refine attempt.
   */
  async generateIntelligenceFromText(
    text: string,
    fields: Array<{ name: string; type: string; value?: any }> = [],
    opts?: { timeoutMs?: number }
  ): Promise<IntelligenceObject | null> {
    const schema = this.getSchema();
    const processedText = this.preprocessText(text, 12000);
    // Pass 1
    const prompt = this.buildPrompt(processedText, fields);
    const raw1 = await this.cli.callCodex(prompt, { timeoutMs: opts?.timeoutMs || 60000 });
    let parsed = this.parseAndValidate(raw1, schema);
    if (!parsed.ok && process.env.DEBUG_CODEX === '1') {
      console.warn('[CodexAI] Validation failed (pass1):', parsed.error);
    }
    if (parsed.ok) return parsed.object as IntelligenceObject;
    // Refine once with validation errors
    const prompt2 = this.buildPrompt(processedText, fields, parsed.error);
    const raw2 = await this.cli.callCodex(prompt2, { timeoutMs: Math.min(15000, opts?.timeoutMs || 15000) });
    parsed = this.parseAndValidate(raw2, schema);
    if (!parsed.ok && process.env.DEBUG_CODEX === '1') {
      console.warn('[CodexAI] Validation failed (refine):', parsed.error);
    }
    if (parsed.ok) return parsed.object as IntelligenceObject;
    return null;
  }

  /**
   * Ask Codex to produce a compact structured extraction first, then summarize via schema.
   */
  async extractFromText(text: string, template?: any, opts?: { timeoutMs?: number }): Promise<any | null> {
    const processedText = this.preprocessText(text, 16000);
    
    const prompt =
      'Extract key structured data from this PDF text. Return ONLY JSON object. ' +
      (template ? `Use this shape as guidance: ${JSON.stringify(template).slice(0, 4000)} ` : '') +
      '\n\nText (truncated):\n' + processedText;
    try {
      const raw = await this.cli.callCodex(prompt, { timeoutMs: opts?.timeoutMs || 45000 });
      const res = this.parseAndValidate(raw, z.any());
      if (res.ok) return res.object;
      // Try naive JSON parse if schema-any rejected due to fence
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fence ? fence[1] : raw;
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  async generateIntelligenceFromExtract(extractObj: any, opts?: { timeoutMs?: number }): Promise<IntelligenceObject | null> {
    const schema = this.getSchema();
    const base = 'You are a precise document analyst. Return ONLY valid JSON that matches the schema. ' +
      'Do not include placeholders or option lists; choose a single category and importance.';
    const shape = '{"summary":{"title":"...","description":"...","category":"tax|legal|financial|business|personal|other","importance":"critical|high|medium|low","processingTips":["...","..."]},"insights":{"documentType":"...","completeness":0-100,"keyInsights":["...","..."],"nextActions":["...","..."],"warnings":["..."]}}';
    const payload = JSON.stringify(extractObj).slice(0, 16000);
    const examples = this.getFewShotExamples();
    const prompt = `${base}\n\n${examples}\n\nExtracted data JSON:\n${payload}\n\nOutput shape: ${shape}`;
    const raw = await this.cli.callCodex(prompt, { timeoutMs: opts?.timeoutMs || 60000 });
    let parsed = this.parseAndValidate(raw, schema);
    if (parsed.ok) return parsed.object as IntelligenceObject;
    const prompt2 = `${base}\n\nExtracted data JSON:\n${payload}\n\nOutput shape: ${shape}\n\nPrevious errors: ${parsed.error}. Provide corrected JSON only.`;
    const raw2 = await this.cli.callCodex(prompt2, { timeoutMs: opts?.timeoutMs || 60000 });
    parsed = this.parseAndValidate(raw2, schema);
    if (parsed.ok) return parsed.object as IntelligenceObject;
    return null;
  }

  /**
   * Compact few-shot examples to steer completeness and tone without large prompt bloat.
   */
  private getFewShotExamples(): string {
    const exampleExtract = {
      document_title: 'Estate Plan for John and Jane Doe',
      document_type: 'Estate Plan',
      personal_information: {
        primary_individuals: [
          { name: 'John Doe' },
          { name: 'Jane Doe' }
        ]
      },
      will: {
        executor: { primary: 'Jane Doe' },
        guardianship: { primary_guardian: 'Nick Doe' }
      },
      trust: {
        name: 'The Doe Family Revocable Living Trust',
        successor_trustee: 'Nick Doe'
      },
      prepared_date: '2021-10-16'
    };
    const exampleIntelligence: IntelligenceObject = {
      summary: {
        title: 'Family Estate Plan (Revocable Trust + Will)',
        description: 'Complete estate plan including revocable living trust, will, POAs, and healthcare directives; guardianship and trustee alternates named.',
        category: 'legal',
        importance: 'high',
        processingTips: [
          'Confirm successor trustee and alternate executor are accurate',
          'Store originals in a fireproof safe; share copies with executor and trustee'
        ]
      },
      insights: {
        documentType: 'Estate planning package (trust + will)',
        completeness: 85,
        keyInsights: [
          'Executor: Jane Doe; Alternate guardian: Nick Doe',
          'Successor trustee: Nick Doe; distributions staged by age',
          'Prepared on 2021-10-16'
        ],
        nextActions: [
          'Verify beneficiaries and distribution schedule',
          'Review every 3 years or after major life events'
        ],
        warnings: []
      }
    };
    return (
      'Example input (extracted JSON) and output (intelligence):\n' +
      `EXTRACT_JSON: ${JSON.stringify(exampleExtract)}\n` +
      `EXPECTED_JSON: ${JSON.stringify(exampleIntelligence)}\n`
    );
  }
}

export default CodexAIService;
