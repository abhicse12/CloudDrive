import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { storage } from '../src/storage/index.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { api } from './helpers/http.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const createFolder = async (client, name, parentId) =>
  (await client.post('/api/folders').send({ name, parentId })).body.data.folder;

const storageUsed = async (userId) =>
  Number((await prisma.user.findUnique({ where: { id: userId } })).storageUsed);

const rowOf = (id) => prisma.file.findUnique({ where: { id } });

/** Fetches a signed URL the way a browser would: no cookies, no login. */
const fetchSigned = (url) => api(app).get(url).buffer(true);

describe('GET /api/files/:id', () => {
  it('returns the file with the path to its folder', async () => {
    const docs = await createFolder(alice, 'Docs');
    const work = await createFolder(alice, 'Work', docs.id);
    const file = await uploadOne(alice, SAMPLES.pdf, 'plan.pdf', { folderId: work.id });

    const res = await alice.get(`/api/files/${file.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.file).toMatchObject({ id: file.id, name: 'plan.pdf' });
    expect(res.body.data.breadcrumbs.map((b) => b.name)).toEqual(['Docs', 'Work']);
  });

  it("is 404 for someone else's file and for trashed files", async () => {
    const mine = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.delete(`/api/files/${mine.id}`);
    const theirs = await uploadOne(bob, SAMPLES.png, 'b.png');

    expect((await alice.get(`/api/files/${mine.id}`)).status).toBe(404);
    expect((await alice.get(`/api/files/${theirs.id}`)).status).toBe(404);
  });
});

describe('download and preview', () => {
  it('issues a short-lived signed URL that serves the exact bytes without login', async () => {
    const file = await uploadOne(alice, SAMPLES.pdf, 'Q3 report.pdf');

    const res = await alice.get(`/api/files/${file.id}/download`);

    expect(res.status).toBe(200);
    const { url, disposition, expiresAt } = res.body.data;
    expect(url).toMatch(/^\/api\/storage\//);
    expect(disposition).toBe('attachment');
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const download = await fetchSigned(url);
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body, SAMPLES.pdf)).toBe(0);
    expect(download.headers['content-disposition']).toMatch(
      /^attachment; filename="Q3 report.pdf"/,
    );
  });

  it('allows inline preview for safe types (image)', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    const res = await alice.get(`/api/files/${file.id}/download?disposition=inline`);
    const preview = await fetchSigned(res.body.data.url);

    expect(res.body.data.disposition).toBe('inline');
    expect(preview.headers['content-type']).toBe('image/png');
    expect(preview.headers['content-disposition']).toMatch(/^inline/);
  });

  it('downgrades inline to attachment for risky types (HTML could run scripts)', async () => {
    const file = await uploadOne(alice, Buffer.from('<script>alert(1)</script>'), 'x.html');

    const res = await alice.get(`/api/files/${file.id}/download?disposition=inline`);
    const served = await fetchSigned(res.body.data.url);

    expect(res.body.data.disposition).toBe('attachment');
    expect(served.headers['content-disposition']).toMatch(/^attachment/);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  it('redirects straight to the file with redirect=true', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    const res = await alice.get(`/api/files/${file.id}/download?redirect=true`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/api\/storage\//);
  });

  it("refuses links for someone else's file or a trashed file (404)", async () => {
    const theirs = await uploadOne(bob, SAMPLES.png, 'b.png');
    const mine = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.delete(`/api/files/${mine.id}`);

    expect((await alice.get(`/api/files/${theirs.id}/download`)).status).toBe(404);
    expect((await alice.get(`/api/files/${mine.id}/download`)).status).toBe(404);
  });

  it('rejects unknown dispositions (400)', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    expect((await alice.get(`/api/files/${file.id}/download?disposition=evil`)).status).toBe(400);
  });
});

describe('rename and move', () => {
  it('renames, and logs the old name', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'old.png');

    const res = await alice.patch(`/api/files/${file.id}`).send({ name: ' new.png ' });

    expect(res.body.data.file.name).toBe('new.png');
    const log = await prisma.activityLog.findFirst({ where: { action: 'FILE_RENAMED' } });
    expect(log.metadata).toEqual({ name: 'new.png', previousName: 'old.png' });
  });

  it('moves into a folder and back to the root', async () => {
    const docs = await createFolder(alice, 'Docs');
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    const moved = await alice.patch(`/api/files/${file.id}`).send({ folderId: docs.id });
    const back = await alice.patch(`/api/files/${file.id}`).send({ folderId: null });

    expect(moved.body.data.file.folderId).toBe(docs.id);
    expect(back.body.data.file.folderId).toBeNull();
  });

  it("can't move into someone else's folder (404), or rename someone else's file", async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const bobsFolder = await createFolder(bob, 'Bob');
    const bobsFile = await uploadOne(bob, SAMPLES.png, 'b.png');

    expect(
      (await alice.patch(`/api/files/${file.id}`).send({ folderId: bobsFolder.id })).status,
    ).toBe(404);
    expect((await alice.patch(`/api/files/${bobsFile.id}`).send({ name: 'x.png' })).status).toBe(
      404,
    );
    expect((await rowOf(bobsFile.id)).originalName).toBe('b.png');
  });

  it.each([{}, { name: 'a/b.png' }, { name: '' }, { storageKey: 'users/x/y' }])(
    'rejects the invalid body %j (400)',
    async (body) => {
      const file = await uploadOne(alice, SAMPLES.png, 'a.png');

      expect((await alice.patch(`/api/files/${file.id}`).send(body)).status).toBe(400);
    },
  );
});

describe('trash and restore', () => {
  it('trashing hides the file but keeps charging the quota', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    const res = await alice.delete(`/api/files/${file.id}`);

    expect(res.status).toBe(204);
    expect((await alice.get('/api/files')).body.data.files).toEqual([]);
    expect((await rowOf(file.id)).deletedAt).not.toBeNull();
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.png.length);
  });

  it('trashing twice, or restoring a file that is not in trash, is 404', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    expect((await alice.post(`/api/files/${file.id}/restore`)).status).toBe(404);
    await alice.delete(`/api/files/${file.id}`);
    expect((await alice.delete(`/api/files/${file.id}`)).status).toBe(404);
  });

  it('restores a file to where it was', async () => {
    const docs = await createFolder(alice, 'Docs');
    const file = await uploadOne(alice, SAMPLES.png, 'a.png', { folderId: docs.id });
    await alice.delete(`/api/files/${file.id}`);

    const res = await alice.post(`/api/files/${file.id}/restore`);

    expect(res.status).toBe(204);
    expect(await rowOf(file.id)).toMatchObject({ deletedAt: null, folderId: docs.id });
  });

  it('restores to the root when its folder is still in the trash', async () => {
    const docs = await createFolder(alice, 'Docs');
    const file = await uploadOne(alice, SAMPLES.png, 'a.png', { folderId: docs.id });
    await alice.delete(`/api/files/${file.id}`);
    await prisma.folder.update({ where: { id: docs.id }, data: { deletedAt: new Date() } });

    await alice.post(`/api/files/${file.id}/restore`);

    expect((await rowOf(file.id)).folderId).toBeNull();
  });
});

describe('permanent delete', () => {
  async function trashedFile() {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.delete(`/api/files/${file.id}`);
    return { ...file, storageKey: (await rowOf(file.id)).storageKey };
  }

  it('only works on files already in the trash', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    expect((await alice.delete(`/api/files/${file.id}/permanent`)).status).toBe(404);
    expect(await rowOf(file.id)).not.toBeNull();
  });

  it('removes the bytes, the row and its share links, and frees the quota', async () => {
    const file = await trashedFile();
    await prisma.share.create({ data: { fileId: file.id, tokenHash: 'a'.repeat(64) } });

    const res = await alice.delete(`/api/files/${file.id}/permanent`);

    expect(res.status).toBe(204);
    expect(await rowOf(file.id)).toBeNull();
    expect(await storage.getMetadata(file.storageKey)).toBeNull();
    expect(await prisma.share.count()).toBe(0);
    expect(await storageUsed(alice.user.id)).toBe(0);
    const log = await prisma.activityLog.findFirst({ where: { action: 'FILE_DELETED' } });
    expect(log.targetId).toBe(file.id); // the log outlives the file
  });

  it('frees the quota only once when two deletes race', async () => {
    const file = await trashedFile();
    await uploadOne(alice, SAMPLES.text, 'keep.txt');
    // Force the race: storage.delete waits until BOTH requests reach it, so both have
    // already found the file before either deletes its row.
    let release;
    const bothArrived = new Promise((resolve) => (release = resolve));
    let arrivals = 0;
    const realDelete = storage.delete.bind(storage);
    vi.spyOn(storage, 'delete').mockImplementation(async (key) => {
      arrivals += 1;
      if (arrivals === 2) release();
      await bothArrived;
      return realDelete(key);
    });

    const results = await Promise.all([
      alice.delete(`/api/files/${file.id}/permanent`),
      alice.delete(`/api/files/${file.id}/permanent`),
    ]);

    expect(results.map((r) => r.status)).toContain(204);
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.text.length);
  });

  it('changes nothing if the storage delete fails, so it can be retried', async () => {
    const file = await trashedFile();
    vi.spyOn(storage, 'delete').mockRejectedValueOnce(new Error('storage down'));

    const res = await alice.delete(`/api/files/${file.id}/permanent`);

    expect(res.status).toBe(500);
    expect(await rowOf(file.id)).not.toBeNull();
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.png.length);
    expect((await alice.delete(`/api/files/${file.id}/permanent`)).status).toBe(204);
  });
});

describe('bulk actions', () => {
  it("acts only on my own files, silently skipping others' and unknown IDs", async () => {
    const a = await uploadOne(alice, SAMPLES.png, 'a.png');
    const b = await uploadOne(alice, SAMPLES.png, 'b.png');
    const bobs = await uploadOne(bob, SAMPLES.png, 'bob.png');

    const res = await alice
      .post('/api/files/bulk')
      .send({ action: 'trash', ids: [a.id, b.id, bobs.id, randomUUID(), a.id] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ action: 'trash', requested: 4, affected: 2 });
    expect((await rowOf(bobs.id)).deletedAt).toBeNull();
    expect(await prisma.activityLog.count({ where: { action: 'FILE_TRASHED' } })).toBe(2);
  });

  it('moves, restores and permanently deletes in bulk', async () => {
    const docs = await createFolder(alice, 'Docs');
    const a = await uploadOne(alice, SAMPLES.png, 'a.png');
    const b = await uploadOne(alice, SAMPLES.text, 'b.txt');
    const ids = [a.id, b.id];
    const bulk = (body) => alice.post('/api/files/bulk').send(body);

    expect((await bulk({ action: 'move', ids, folderId: docs.id })).body.data.affected).toBe(2);
    expect((await rowOf(a.id)).folderId).toBe(docs.id);

    await bulk({ action: 'trash', ids });
    expect((await bulk({ action: 'restore', ids })).body.data.affected).toBe(2);

    await bulk({ action: 'trash', ids });
    expect((await bulk({ action: 'delete', ids })).body.data.affected).toBe(2);
    expect(await prisma.file.count()).toBe(0);
    expect(await storageUsed(alice.user.id)).toBe(0);
  });

  it("can't bulk-move into someone else's folder (404)", async () => {
    const a = await uploadOne(alice, SAMPLES.png, 'a.png');
    const bobsFolder = await createFolder(bob, 'Bob');

    const res = await alice
      .post('/api/files/bulk')
      .send({ action: 'move', ids: [a.id], folderId: bobsFolder.id });

    expect(res.status).toBe(404);
  });

  it.each([
    { action: 'move', ids: [randomUUID()] }, // move needs folderId
    { action: 'trash', ids: [randomUUID()], folderId: null }, // only move takes folderId
    { action: 'explode', ids: [randomUUID()] },
    { action: 'trash', ids: [] },
    { action: 'trash', ids: ['not-a-uuid'] },
    { action: 'trash', ids: Array.from({ length: 101 }, () => randomUUID()) },
  ])('rejects the invalid request %#', async (body) => {
    expect((await alice.post('/api/files/bulk').send(body)).status).toBe(400);
  });
});
