import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProfileService } from './profile-service';
import path from 'path';
import { promises as fs } from 'fs';

const originalHome = process.env.HOME;
const tmpHome = path.join(process.cwd(), 'temp', `home-vitest-${Date.now()}`);

beforeAll(async () => {
  await fs.mkdir(tmpHome, { recursive: true });
  process.env.HOME = tmpHome;
});

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
});

describe('ProfileService', () => {
  it('creates, updates, lists, exports, and deletes a profile', async () => {
    const svc = new ProfileService();
    const name = 'vitest_profile';
    const data = { first: 'Alice', ssn: '123-45-6789' };

    const created = await svc.createProfile(name, data, { description: 'Test', isDefault: true });
    expect(created.name).toBe(name);

    const fetched = await svc.getProfile(name);
    expect(fetched?.data.first).toBe('Alice');

    const updated = await svc.updateProfile(name, { ...fetched!.data, city: 'SF' });
    expect(updated.version).toBeGreaterThan(created.version);

    const listed = await svc.listProfiles();
    expect(listed.length).toBeGreaterThan(0);

    const exportPath = path.join(process.cwd(), 'temp', `vitest-export-${Date.now()}.json`);
    await svc.exportProfile(name, exportPath);
    const exists = await fs.access(exportPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const deleted = await svc.deleteProfile(name);
    expect(deleted).toBe(true);
  });
});

