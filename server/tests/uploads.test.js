import fs from 'node:fs/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { storage } from '../src/storage/index.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, upload, uploadOne } from './helpers/files.js';
import { api } from './helpers/http.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let alice;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  await fs.rm(env.UPLOAD_TMP_DIR, { recursive: true, force: true });
  alice = await loginAsNewUser(app, { name: 'Alice' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const storageUsed = async (userId) =>
  Number((await prisma.user.findUnique({ where: { id: userId } })).storageUsed);

const setLimit = (userId, bytes) =>
  prisma.user.update({ where: { id: userId }, data: { storageLimit: BigInt(bytes) } });

/** Multer's temp folder must be empty after every request, success or failure. */
async function expectNoTempFiles() {
  const leftovers = await fs.readdir(env.UPLOAD_TMP_DIR).catch(() => []);
  expect(leftovers).toEqual([]);
}

describe('a successful upload', () => {
  it('stores the bytes, creates an ACTIVE row, charges the quota and logs it', async () => {
    const res = await upload(alice, [{ content: SAMPLES.png, name: 'photo.png' }]);

    expect(res.status).toBe(201);
    const [dto] = res.body.data.uploaded;
    expect(dto).toMatchObject({
      name: 'photo.png',
      mimeType: 'image/png',
      category: 'IMAGE',
      size: SAMPLES.png.length,
      folderId: null,
    });
    // Internal details never reach the client.
    expect(dto).not.toHaveProperty('storageKey');
    expect(dto).not.toHaveProperty('status');

    const row = await prisma.file.findUnique({ where: { id: dto.id } });
    expect(row.status).toBe('ACTIVE');
    expect(row.storageKey).toBe(`users/${alice.user.id}/${dto.id}`);
    expect(await storage.getMetadata(row.storageKey)).toMatchObject({ size: SAMPLES.png.length });

    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.png.length);
    const log = await prisma.activityLog.findFirst({ where: { targetId: dto.id } });
    expect(log.action).toBe('FILE_UPLOADED');
    await expectNoTempFiles();
  });

  it('keeps non-English filenames intact (UTF-8)', async () => {
    const dto = await uploadOne(alice, SAMPLES.text, 'रिपोर्ट café 日本.txt');

    expect(dto.name).toBe('रिपोर्ट café 日本.txt');
  });

  it('uploads into a folder', async () => {
    const folder = (await alice.post('/api/folders').send({ name: 'Pics' })).body.data.folder;

    const dto = await uploadOne(alice, SAMPLES.png, 'a.png', { folderId: folder.id });

    expect(dto.folderId).toBe(folder.id);
  });
});

describe('file type detection (from the bytes, not the name)', () => {
  it('trusts the content over a misleading extension', async () => {
    const dto = await uploadOne(alice, SAMPLES.png, 'actually-a-png.jpg');

    expect(dto.mimeType).toBe('image/png');
  });

  it.each([
    ['an executable renamed to .pdf', SAMPLES.exe, 'invoice.pdf'],
    ['an executable renamed to .txt', SAMPLES.exe, 'readme.txt'],
    ['binary junk named .txt', SAMPLES.binaryJunk, 'notes.txt'],
    ['text pretending to be an image', SAMPLES.text, 'photo.png'],
    ['an unknown text extension', SAMPLES.text, 'script.sh'],
  ])('refuses %s (415), storing nothing', async (_label, content, name) => {
    const res = await upload(alice, [{ content, name }]);

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.file.count()).toBe(0);
    expect(await storageUsed(alice.user.id)).toBe(0);
    await expectNoTempFiles();
  });

  it.each([
    ['notes.md', 'text/markdown'],
    ['data.CSV', 'text/csv'],
    ['config.json', 'application/json'],
  ])('accepts the text file %s as %s', async (name, mimeType) => {
    const dto = await uploadOne(alice, SAMPLES.text, name);

    expect(dto).toMatchObject({ mimeType, category: 'DOCUMENT' });
  });

  it('accepts PDFs', async () => {
    expect((await uploadOne(alice, SAMPLES.pdf, 'doc.pdf')).mimeType).toBe('application/pdf');
  });

  it('accepts old Office files only with a matching extension', async () => {
    const doc = await uploadOne(alice, SAMPLES.cfb, 'letter.doc');
    const unknown = await upload(alice, [{ content: SAMPLES.cfb, name: 'mystery.bin' }]);

    expect(doc.mimeType).toBe('application/msword');
    expect(unknown.status).toBe(415);
  });
});

describe('names', () => {
  it('keeps only the last part of a path some browsers send', async () => {
    const dto = await uploadOne(alice, SAMPLES.text, 'C:\\Users\\me\\notes.txt');

    expect(dto.name).toBe('notes.txt');
  });
});

describe('several files at once', () => {
  it('stores the good files and reports the bad ones (201)', async () => {
    const res = await upload(alice, [
      { content: SAMPLES.png, name: 'good.png' },
      { content: SAMPLES.exe, name: 'bad.pdf' },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.uploaded.map((f) => f.name)).toEqual(['good.png']);
    expect(res.body.data.failed).toEqual([
      { name: 'bad.pdf', error: { code: 'UNSUPPORTED_FILE_TYPE', message: expect.any(String) } },
    ]);
    await expectNoTempFiles();
  });

  it('when every file fails, responds with the error and per-file details', async () => {
    const res = await upload(alice, [
      { content: SAMPLES.exe, name: 'a.pdf' },
      { content: SAMPLES.exe, name: 'b.pdf' },
    ]);

    expect(res.status).toBe(415);
    expect(res.body.error.details.map((d) => d.field)).toEqual(['a.pdf', 'b.pdf']);
  });
});

describe('limits', () => {
  it('rejects a file over MAX_FILE_SIZE_MB (413)', async () => {
    const tooBig = Buffer.alloc(env.MAX_FILE_SIZE_MB * 1024 * 1024 + 1, 'a');

    const res = await upload(alice, [{ content: tooBig, name: 'big.txt' }]);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await prisma.file.count()).toBe(0);
    await expectNoTempFiles();
  });

  it('rejects more than MAX_FILES_PER_UPLOAD files (400)', async () => {
    const files = Array.from({ length: env.MAX_FILES_PER_UPLOAD + 1 }, (_, i) => ({
      content: SAMPLES.text,
      name: `f${i}.txt`,
    }));

    const res = await upload(alice, files);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_FILES');
    expect(await prisma.file.count()).toBe(0);
    await expectNoTempFiles();
  });

  it('rejects a request with no files (400)', async () => {
    const res = await alice.post('/api/files/upload').field('folderId', '');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILES');
  });
});

describe('quota', () => {
  it('refuses a file that does not fit, without charging anything (413)', async () => {
    await setLimit(alice.user.id, 10);

    const res = await upload(alice, [{ content: SAMPLES.text, name: 'a.txt' }]);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
    expect(await prisma.file.count()).toBe(0);
    expect(await storageUsed(alice.user.id)).toBe(0);
    await expectNoTempFiles();
  });

  it('refuses early, before receiving the body, when Content-Length is clearly too big', async () => {
    await setLimit(alice.user.id, 10);
    const big = Buffer.alloc(200 * 1024, 'a');

    const res = await upload(alice, [{ content: big, name: 'a.txt' }]);

    expect(res.status).toBe(413);
    // The pre-check's wording ("this upload") rather than the per-file one ("this file").
    expect(res.body.error.message).toMatch(/this upload/);
  });

  it('never goes over the limit, even with parallel uploads (race condition)', async () => {
    const size = SAMPLES.text.length;
    await setLimit(alice.user.id, size * 3); // room for exactly 3

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        upload(alice, [{ content: SAMPLES.text, name: `${i}.txt` }]),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 413, 413, 413]);
    expect(await storageUsed(alice.user.id)).toBe(size * 3);
    expect(await prisma.file.count({ where: { status: 'ACTIVE' } })).toBe(3);
  });
});

describe('failure handling', () => {
  it('marks the file FAILED and gives the quota back if storage fails', async () => {
    vi.spyOn(storage, 'upload').mockRejectedValueOnce(new Error('disk full'));

    const res = await upload(alice, [{ content: SAMPLES.png, name: 'a.png' }]);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('UPLOAD_FAILED');
    expect(res.body.error.message).not.toMatch(/disk full/); // internals stay private
    const row = await prisma.file.findFirst();
    expect(row.status).toBe('FAILED');
    expect(await storageUsed(alice.user.id)).toBe(0);
    await expectNoTempFiles();
  });
});

describe('access control', () => {
  it("can't upload into someone else's folder (404), and leaves no temp files", async () => {
    const bob = await loginAsNewUser(app, { name: 'Bob' });
    const bobsFolder = (await bob.post('/api/folders').send({ name: 'Bob' })).body.data.folder;

    const res = await upload(alice, [{ content: SAMPLES.png, name: 'a.png' }], {
      folderId: bobsFolder.id,
    });

    expect(res.status).toBe(404);
    expect(await prisma.file.count()).toBe(0);
    await expectNoTempFiles();
  });

  it('rejects unknown form fields (400)', async () => {
    const res = await alice
      .post('/api/files/upload')
      .field('isAdmin', 'true')
      .attach('files', SAMPLES.png, 'a.png');

    expect(res.status).toBe(400);
    await expectNoTempFiles();
  });

  it('requires login', async () => {
    const res = await api(app).post('/api/files/upload').attach('files', SAMPLES.png, 'a.png');

    expect(res.status).toBe(401);
  });

  it('requires the CSRF token', async () => {
    const res = await alice
      .post('/api/files/upload')
      .set('X-CSRF-Token', 'wrong')
      .attach('files', SAMPLES.png, 'a.png');

    expect(res.status).toBe(403);
  });
});
