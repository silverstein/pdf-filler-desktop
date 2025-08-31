import { describe, it, expect } from 'vitest';
import { CSVService } from './csv-service';
import { promises as fs } from 'fs';
import path from 'path';

describe('CSVService', () => {
  it('parses CSV from string and generates CSV', async () => {
    const svc = new CSVService();
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,SF\n';
    const rows = await svc.parseCSVString(csv);
    expect(rows.length).toBe(2);
    expect(Object.keys(rows[0])).toEqual(['name', 'age', 'city']);

    const out = await svc.generateCSV(rows);
    expect(out).toContain('name,age,city');
  });

  it('parses CSV from file', async () => {
    const svc = new CSVService();
    const tmp = path.join(process.cwd(), 'temp', `vitest-csv-${Date.now()}.csv`);
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, 'first,last\nJohn,Doe\nJane,Doe\n', 'utf8');
    const rows = await svc.parseCSV(tmp);
    expect(rows.length).toBe(2);
    expect(Object.keys(rows[0])).toEqual(['first', 'last']);
  });
});

