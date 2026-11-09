import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let alice;
let bob;
let docs;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });
  docs = (await alice.post('/api/folders').send({ name: 'Docs' })).body.data.folder;
});
afterAll(() => prisma.$disconnect());

const names = (res) => res.body.data.files.map((f) => f.name);

describe('listing', () => {
  beforeEach(async () => {
    await uploadOne(alice, SAMPLES.png, 'root-photo.png');
    await uploadOne(alice, SAMPLES.text, 'Report.txt', { folderId: docs.id });
    await uploadOne(alice, SAMPLES.pdf, 'report-final.pdf', { folderId: docs.id });
    await uploadOne(bob, SAMPLES.text, 'bob-report.txt');
  });

  it('lists the root by default, a folder by ID, or everything with "all"', async () => {
    expect(names(await alice.get('/api/files'))).toEqual(['root-photo.png']);
    expect(names(await alice.get(`/api/files?folderId=${docs.id}`)).sort()).toEqual([
      'Report.txt',
      'report-final.pdf',
    ]);
    expect(names(await alice.get('/api/files?folderId=all'))).toHaveLength(3);
  });

  it('searches every folder, ignoring case, and only my files', async () => {
    const res = await alice.get('/api/files?q=REPORT');

    expect(names(res).sort()).toEqual(['Report.txt', 'report-final.pdf']);
  });

  it('treats % and _ in a search as literal characters, not wildcards', async () => {
    expect(names(await alice.get('/api/files?q=%25'))).toEqual([]); // "%"
    expect(names(await alice.get('/api/files?q=_'))).toEqual([]);
  });

  it('still finds names that really contain % or _', async () => {
    await uploadOne(alice, SAMPLES.text, '100%_done.txt');

    expect(names(await alice.get('/api/files?q=0%25_d'))).toEqual(['100%_done.txt']);
  });

  it('can search inside one folder only', async () => {
    const res = await alice.get(`/api/files?q=report&folderId=${docs.id}&category=document`);

    expect(names(res).sort()).toEqual(['Report.txt', 'report-final.pdf']);
  });

  it('filters by category', async () => {
    const res = await alice.get('/api/files?folderId=all&category=IMAGE');

    expect(names(res)).toEqual(['root-photo.png']);
  });

  it('sorts by size', async () => {
    const res = await alice.get('/api/files?folderId=all&sortBy=size&sortOrder=desc');

    const sizes = res.body.data.files.map((f) => f.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('paginates without repeating or skipping files', async () => {
    const page1 = await alice.get('/api/files?folderId=all&pageSize=2&page=1');
    const page2 = await alice.get('/api/files?folderId=all&pageSize=2&page=2');

    expect(page1.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(new Set([...names(page1), ...names(page2)]).size).toBe(3);
  });
});

describe('what is hidden', () => {
  it('hides uploads in progress, failed uploads and trashed files', async () => {
    const visible = await uploadOne(alice, SAMPLES.text, 'visible.txt');
    const trashed = await uploadOne(alice, SAMPLES.text, 'trashed.txt');
    await prisma.file.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
    for (const status of ['UPLOADING', 'FAILED']) {
      await prisma.file.create({
        data: {
          userId: alice.user.id,
          originalName: `${status}.txt`,
          storageKey: `users/${alice.user.id}/${status}`,
          mimeType: 'text/plain',
          category: 'DOCUMENT',
          sizeBytes: 1n,
          status,
        },
      });
    }

    const res = await alice.get('/api/files?folderId=all');

    expect(res.body.data.files.map((f) => f.id)).toEqual([visible.id]);
  });
});

describe('validation and ownership', () => {
  it("returns 404 when listing someone else's folder", async () => {
    const res = await bob.get(`/api/files?folderId=${docs.id}`);

    expect(res.status).toBe(404);
  });

  it.each(['pageSize=1000', 'page=0', 'sortBy=password', 'category=EXE', 'folderId=abc', 'x=1'])(
    'rejects the invalid query %s (400)',
    async (query) => {
      expect((await alice.get(`/api/files?${query}`)).status).toBe(400);
    },
  );
});
