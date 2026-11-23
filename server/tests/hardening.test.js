/**
 * Paths the coverage report showed untested that matter for safety or data integrity:
 * signed-URL tokens that are correctly signed but malicious, cross-disk uploads, and
 * cleanup that must keep going when one item fails.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { purgeTrash } from '../src/jobs/purgeTrash.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { folderRepository } from '../src/repositories/folder.repository.js';
import { storage } from '../src/storage/index.js';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe('LocalStorageProvider: tokens that are signed but still must be refused', () => {
  const root = path.join(os.tmpdir(), `clouddrive-hardening-${randomUUID()}`);
  const provider = new LocalStorageProvider({ root, signingSecret: 's'.repeat(40) });

  /** A token with a VALID signature over any payload (as if the secret had leaked). */
  const signed = (payload) => {
    const body = Buffer.from(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ).toString('base64url');
    return `${body}.${provider.sign(body)}`;
  };
  const future = () => Math.floor(Date.now() / 1000) + 60;

  it('accepts a normal token', () => {
    expect(provider.verifySignedToken(signed({ k: 'users/a/b', e: future() }))).toMatchObject({
      k: 'users/a/b',
      filePath: path.join(path.resolve(root), 'users', 'a', 'b'),
    });
  });

  it('refuses keys that try to leave the storage root, even with a valid signature', () => {
    for (const k of [
      '../../server/.env',
      'users/../../x',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      '',
    ]) {
      expect(provider.verifySignedToken(signed({ k, e: future() }))).toBeNull();
    }
  });

  it('refuses a signed body that is not JSON, and one without a numeric expiry', () => {
    expect(provider.verifySignedToken(signed('not json at all'))).toBeNull();
    expect(provider.verifySignedToken(signed({ k: 'users/a/b', e: 'never' }))).toBeNull();
    expect(provider.verifySignedToken(signed({ k: 'users/a/b' }))).toBeNull();
  });

  it('refuses malformed tokens before checking anything else', () => {
    for (const token of ['', 'abc', 'a.b.c', '.sig', 'body.', undefined, null]) {
      expect(provider.verifySignedToken(token)).toBeNull();
    }
  });

  it('copies instead of renaming when the temp file is on another disk (EXDEV)', async () => {
    const source = path.join(os.tmpdir(), `clouddrive-src-${randomUUID()}`);
    await fs.writeFile(source, 'cross-disk bytes');
    const crossDevice = Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(crossDevice);

    await provider.upload({ key: 'users/u/exdev', sourcePath: source });

    expect(await fs.readFile(provider.pathFor('users/u/exdev'), 'utf8')).toBe('cross-disk bytes');
    await expect(fs.access(source)).rejects.toThrow(); // the temp file is gone
  });

  it('passes other rename errors on (no silent copy)', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('no'), { code: 'EACCES' }),
    );
    await expect(provider.upload({ key: 'users/u/x', sourcePath: 'whatever' })).rejects.toThrow(
      'no',
    );
  });
});

describe('cleanup keeps going when one item fails', () => {
  let alice;
  let bob;

  beforeEach(async () => {
    await resetDb();
    await resetRateLimits();
    alice = await loginAsNewUser(app, { name: 'Alice' });
    bob = await loginAsNewUser(app, { name: 'Bob' });
  });

  const later = () => new Date(Date.now() + 31 * DAY_MS);
  const exists = async (model, id) => (await prisma[model].findUnique({ where: { id } })) !== null;

  /** Fails storage.delete for `failingKey` only. */
  const failStorageDeleteFor = (failingKey) => {
    const real = storage.delete.bind(storage);
    vi.spyOn(storage, 'delete').mockImplementation(async (key) => {
      if (key === failingKey) throw new Error('storage unavailable');
      return real(key);
    });
  };

  it("the trash purge: one user's broken file doesn't block another user's", async () => {
    const broken = await uploadOne(alice, SAMPLES.png, 'a.png');
    const fine = await uploadOne(bob, SAMPLES.png, 'b.png');
    await alice.delete(`/api/files/${broken.id}`);
    await bob.delete(`/api/files/${fine.id}`);
    const brokenRow = await prisma.file.findUnique({ where: { id: broken.id } });
    failStorageDeleteFor(brokenRow.storageKey);

    const result = await purgeTrash({ now: later() });

    expect(result.files).toBe(1);
    expect(await exists('file', fine.id)).toBe(false);
    // Kept (and still charged) so the next run can retry; nothing half-deleted.
    expect(await exists('file', broken.id)).toBe(true);
    const aliceRow = await prisma.user.findUnique({ where: { id: alice.user.id } });
    expect(aliceRow.storageUsed).toBe(BigInt(SAMPLES.png.length));
  });

  it("the trash purge: one user's broken folder doesn't block another user's", async () => {
    const folderOf = async (client, name) =>
      (await client.post('/api/folders').send({ name })).body.data.folder.id;
    const aliceFolder = await folderOf(alice, 'A');
    const bobFolder = await folderOf(bob, 'B');
    const inside = await uploadOne(alice, SAMPLES.png, 'in.png', { folderId: aliceFolder });
    await uploadOne(bob, SAMPLES.png, 'in.png', { folderId: bobFolder });
    await alice.delete(`/api/folders/${aliceFolder}`);
    await bob.delete(`/api/folders/${bobFolder}`);
    const insideRow = await prisma.file.findUnique({ where: { id: inside.id } });
    failStorageDeleteFor(insideRow.storageKey);

    const result = await purgeTrash({ now: later() });

    expect(result.folders).toBe(1);
    expect(await exists('folder', bobFolder)).toBe(false);
    expect(await exists('folder', aliceFolder)).toBe(true);
  });

  it('two "empty trash" with folders at once: the slower one skips what is already gone', async () => {
    for (const name of ['One', 'Two']) {
      const id = (await alice.post('/api/folders').send({ name })).body.data.folder.id;
      await uploadOne(alice, SAMPLES.png, `${name}.png`, { folderId: id });
      await alice.delete(`/api/folders/${id}`);
    }
    // Both requests read the same list of trashed folders before either deletes one.
    const real = folderRepository.listTrashedTopLevel.bind(folderRepository);
    let arrived = 0;
    let release;
    const both = new Promise((resolve) => (release = resolve));
    vi.spyOn(folderRepository, 'listTrashedTopLevel').mockImplementation(async (...args) => {
      const result = await real(...args);
      arrived += 1;
      if (arrived === 2) release();
      await both;
      return result;
    });

    const results = await Promise.all([alice.delete('/api/trash'), alice.delete('/api/trash')]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const deleted = results.reduce((sum, r) => sum + r.body.data.folders, 0);
    expect(deleted).toBe(2); // each folder counted once, by whichever request got it
    expect(await prisma.folder.count({ where: { userId: alice.user.id } })).toBe(0);
    const user = await prisma.user.findUnique({ where: { id: alice.user.id } });
    expect(user.storageUsed).toBe(0n);
  });

  it('"empty trash" reports a real storage error instead of pretending it worked', async () => {
    const id = (await alice.post('/api/folders').send({ name: 'X' })).body.data.folder.id;
    const file = await uploadOne(alice, SAMPLES.png, 'x.png', { folderId: id });
    await alice.delete(`/api/folders/${id}`);
    const row = await prisma.file.findUnique({ where: { id: file.id } });
    failStorageDeleteFor(row.storageKey);

    const res = await alice.delete('/api/trash');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('storage unavailable'); // no internals
    expect(await exists('folder', id)).toBe(true); // still in trash, can be retried
  });
});
