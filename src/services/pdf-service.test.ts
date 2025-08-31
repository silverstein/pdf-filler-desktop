import { describe, it, expect } from 'vitest';
import { PDFService } from './pdf-service';
import { PDFDocument } from 'pdf-lib';
import { promises as fs } from 'fs';
import path from 'path';

async function createFormPdf(target: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  const name = form.createTextField('name');
  name.addToPage(page, { x: 50, y: 300, width: 200, height: 24 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 50, y: 250, width: 18, height: 18 });
  const state = form.createDropdown('state');
  state.setOptions(['CA', 'NY']);
  state.addToPage(page, { x: 50, y: 200, width: 100, height: 24 });
  const bytes = await pdfDoc.save();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}

describe('PDFService', () => {
  it('reads, fills, saves, and validates a form PDF', async () => {
    const svc = new PDFService();
    const base = path.join(process.cwd(), 'temp');
    const input = path.join(base, `vitest-form-${Date.now()}.pdf`);
    const output = path.join(base, `vitest-form-filled-${Date.now()}.pdf`);
    await createFormPdf(input);

    const fields = await svc.readFormFields(input);
    expect(fields.map(f => f.name).sort()).toEqual(['agree', 'name', 'state']);

    const doc = await svc.fillFormFields(input, { name: 'Alice', agree: true, state: 'CA' });
    await svc.saveFilledPDF(doc, output);

    const validation = await svc.validateForm(output, ['name', 'agree', 'state']);
    expect(validation.isValid).toBe(true);
  });
});

