import assert from 'assert';
import path from 'path';
import { promises as fs } from 'fs';
import { PDFDocument } from 'pdf-lib';
import { PDFService } from './services/pdf-service';

async function createSamplePdfWithForm(pdfPath: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();

  const nameField = form.createTextField('name');
  nameField.setText('');
  nameField.addToPage(page, { x: 50, y: 300, width: 200, height: 24 });

  const agreeField = form.createCheckBox('agree');
  agreeField.addToPage(page, { x: 50, y: 250, width: 18, height: 18 });

  const stateField = form.createDropdown('state');
  stateField.setOptions(['CA', 'NY']);
  stateField.addToPage(page, { x: 50, y: 200, width: 100, height: 24 });

  const bytes = await pdfDoc.save();
  await fs.mkdir(path.dirname(pdfPath), { recursive: true });
  await fs.writeFile(pdfPath, bytes);
}

async function main() {
  const service = new PDFService();
  const inputPath = path.join(process.cwd(), 'temp', `sample-form-${Date.now()}.pdf`);
  const outputPath = path.join(process.cwd(), 'temp', `sample-form-filled-${Date.now()}.pdf`);

  await createSamplePdfWithForm(inputPath);

  // Read fields
  const fields = await service.readFormFields(inputPath);
  const fieldNames = fields.map(f => f.name).sort();
  assert.deepStrictEqual(fieldNames, ['agree', 'name', 'state']);

  // Fill fields
  const doc = await service.fillFormFields(inputPath, {
    name: 'Alice',
    agree: true,
    state: 'CA'
  });

  const saved = await service.saveFilledPDF(doc, outputPath);
  assert.ok(saved.endsWith('.pdf'));

  // Validate required
  const validation = await service.validateForm(outputPath, ['name', 'agree', 'state']);
  assert.strictEqual(validation.isValid, true);

  console.log('PDFService tests passed:', {
    fieldNames,
    outputPath
  });
}

main().catch((err) => {
  console.error('PDFService tests failed:', err);
  process.exit(1);
});

