import assert from 'assert';
import path from 'path';
import { promises as fs } from 'fs';
import { CSVService } from './services/csv-service';

async function main() {
  const csv = new CSVService();

  // 1) Parse CSV from string
  const csvString = 'name,age,city\nAlice,30,NYC\nBob,25,SF\n';
  const rowsFromString = await csv.parseCSVString(csvString);
  assert.strictEqual(rowsFromString.length, 2, 'should parse two rows');
  assert.deepStrictEqual(Object.keys(rowsFromString[0]), ['name', 'age', 'city']);

  // 2) Generate CSV and read back
  const generated = await csv.generateCSV(rowsFromString);
  assert.ok(generated.includes('name,age,city'));

  // 3) Parse CSV from file (temp)
  const tmpPath = path.join(process.cwd(), 'temp', `csv-test-${Date.now()}.csv`);
  await fs.mkdir(path.dirname(tmpPath), { recursive: true });
  await fs.writeFile(tmpPath, 'first,last\nJohn,Doe\nJane,Doe\n', 'utf8');
  const rowsFromFile = await csv.parseCSV(tmpPath);
  assert.strictEqual(rowsFromFile.length, 2, 'file should have two rows');
  assert.deepStrictEqual(Object.keys(rowsFromFile[0]), ['first', 'last']);

  console.log('CSVService tests passed:', {
    rowsFromString: rowsFromString.length,
    rowsFromFile: rowsFromFile.length
  });
}

main().catch((err) => {
  console.error('CSVService tests failed:', err);
  process.exit(1);
});

