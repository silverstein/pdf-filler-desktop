import assert from 'assert';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { ProfileService } from './services/profile-service';

async function withTempHome<T>(fn: () => Promise<T>) {
  const tmpHome = path.join(process.cwd(), 'temp', `home-${Date.now()}`);
  await fs.mkdir(tmpHome, { recursive: true });
  const originalHome = process.env.HOME;
  try {
    process.env.HOME = tmpHome;
    return await fn();
  } finally {
    if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
  }
}

async function main() {
  await withTempHome(async () => {
    const service = new ProfileService();

    const name = 'test_profile';
    const data = { firstName: 'Alice', ssn: '123-45-6789', city: 'NYC' };
    const created = await service.createProfile(name, data, { description: 'Test profile', tags: ['test'], isDefault: true });
    assert.strictEqual(created.name, name);
    assert.strictEqual(created.metadata.fieldCount, 3);
    assert.strictEqual(created.isDefault, true);

    const fetched = await service.getProfile(name);
    assert.ok(fetched);
    assert.strictEqual(fetched!.data.firstName, 'Alice');

    const updated = await service.updateProfile(name, { ...fetched!.data, city: 'SF' });
    assert.strictEqual(updated.version, created.version + 1);

    const listed = await service.listProfiles();
    assert.ok(listed.length >= 1);

    const exportedPath = path.join(process.cwd(), 'temp', `export-${Date.now()}.json`);
    await service.exportProfile(name, exportedPath);
    const exportedExists = await fs.access(exportedPath).then(() => true).catch(() => false);
    assert.strictEqual(exportedExists, true);

    const deleted = await service.deleteProfile(name);
    assert.strictEqual(deleted, true);

    console.log('ProfileService tests passed:', { listed: listed.length, exportedPath });
  });
}

main().catch((err) => {
  console.error('ProfileService tests failed:', err);
  process.exit(1);
});

