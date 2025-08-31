import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './server';

describe('API /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('geminiCLI');
  });
});

