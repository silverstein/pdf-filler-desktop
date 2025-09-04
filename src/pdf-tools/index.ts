// src/pdf-tools/index.ts
import path from 'path';
import { promises as fs } from 'fs';
import { PDFService } from '../services/pdf-service';
import { CSVService } from '../services/csv-service';

export type FieldDescriptor = {
  name: string;
  type: string;
  value: unknown;
  required: boolean;
  readOnly: boolean;
  options: string[] | null;
};

const pdfService = new PDFService();
const csvService = new CSVService();

function assertAbsolute(p: string, label: string): void {
  if (!path.isAbsolute(p)) {
    throw new Error(`${label} must be an absolute path`);
  }
}

export async function listFields(pdfPath: string, password?: string): Promise<FieldDescriptor[]> {
  assertAbsolute(pdfPath, 'pdfPath');
  return (await pdfService.readFormFields(pdfPath, password ?? null)) as unknown as FieldDescriptor[];
}

export async function fillForm(
  pdfPath: string,
  data: Record<string, string | number | boolean>,
  outPath: string,
  options?: { flatten?: boolean; password?: string }
) {
  assertAbsolute(pdfPath, 'pdfPath');
  assertAbsolute(outPath, 'outPath');

  const pdfDoc = await pdfService.fillFormFields(pdfPath, data, options?.password ?? null);

  // Optionally flatten in the future (pdf-lib supports partial flatten patterns)
  // if (options?.flatten) { /* flatten implementation hook */ }

  const saved = await pdfService.saveFilledPDF(pdfDoc, outPath);
  return { outputPath: saved };
}

export async function extractText(pdfPath: string, password?: string) {
  assertAbsolute(pdfPath, 'pdfPath');
  // Prefer pdf.js-based extraction for better spacing/layout; falls back internally
  const res = await pdfService.extractFullTextPdfjs(pdfPath, password ?? null);
  // pdf-parse returns a single text blob; provide both full and metadata
  return {
    pages: res.pages,
    fullText: res.text ?? '',
    info: res.info,
    metadata: res.metadata,
    version: res.version
  };
}

export async function extractToCSV(
  pdfPath: string,
  outPath: string,
  options?: { delimiter?: string; password?: string }
) {
  assertAbsolute(pdfPath, 'pdfPath');
  assertAbsolute(outPath, 'outPath');

  const fields = await pdfService.readFormFields(pdfPath, options?.password ?? null);
  // Single-row CSV of current field values
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    row[f.name] = f.value ?? '';
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await csvService.saveCSV([row], outPath, null, {
    delimiter: options?.delimiter ?? ',',
    header: true
  });

  return { outputPath: outPath, columns: Object.keys(row).length };
}

export async function compareForms(
  leftPath: string,
  rightPath: string,
  options?: { leftPassword?: string; rightPassword?: string }
) {
  assertAbsolute(leftPath, 'leftPath');
  assertAbsolute(rightPath, 'rightPath');

  const [lf, rf] = await Promise.all([
    pdfService.readFormFields(leftPath, options?.leftPassword ?? null),
    pdfService.readFormFields(rightPath, options?.rightPassword ?? null)
  ]);

  const lMap = new Map(lf.map((f) => [f.name, f]));
  const rMap = new Map(rf.map((f) => [f.name, f]));

  const allNames = Array.from(new Set([...lMap.keys(), ...rMap.keys()])).sort();
  const diffs: Array<{ field: string; left?: unknown; right?: unknown }> = [];

  for (const name of allNames) {
    const lv = lMap.get(name)?.value;
    const rv = rMap.get(name)?.value;
    const different =
      (lv === undefined && rv !== undefined) ||
      (rv === undefined && lv !== undefined) ||
      JSON.stringify(lv) !== JSON.stringify(rv);

    if (different) {
      diffs.push({ field: name, left: lv, right: rv });
    }
  }

  return { differences: diffs, leftCount: lf.length, rightCount: rf.length };
}

// Placeholder for future lightweight OCR (e.g., tesseract-wasm)
export async function extractTextOCR(_pdfPath: string): Promise<never> {
  throw new Error('OCR not enabled. Enable an OCR MCP or WASM module to use this feature.');
}
