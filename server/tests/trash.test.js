import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { storage } from '../src/storage/index.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();
const DAY_MS = 24 * 60 * 60 * 1000;

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });
});
afterAll(() => prisma.$disconnect());

const createFolder = async (client, name, parentId) => {
  const res = await client.post('/api/folders').send({ name, parentId });
  expect(res.status).toBe(201);
  return res.body.data.folder;
};
const folderRow = (id) => prisma.folder.findUnique({ where: { id } });
const fileRow = (id) => prisma.file.findUnique({ where: { id } });
const storageUsed = async (userId) =>
  Number((await prisma.user.findUnique({ where: { id: userId } })).storageUsed);

/** Docs/ → Work/ → plan.pdf, plus notes.txt directly in Docs/ */
async function buildTree(client = alice) {
  const docs = await createFolder(client, 'Docs');
  const work = await createFolder(client, 'Work', docs.id);
  const plan = await uploadOne(client, SAMPLES.pdf, 'plan.pdf', { folderId: work.id });
  const notes = await uploadOne(client, SAMPLES.text, 'notes.txt', { folderId: docs.id });
  return { docs, work, plan, notes };
}

describe('trashing a folder', () => {
  it('trashes the whole subtree with ONE shared timestamp, keeping the quota', async () => {
    const { docs, work, plan, notes } = await buildTree();

    const res = await alice.delete(`/api/folders/${docs.id}`);

    expect(res.status).toBe(204);
    const rows = await Promise.all([
      folderRow(docs.id),
      folderRow(work.id),
      fileRow(plan.id),
      fileRow(notes.id),
    ]);
    const stamps = new Set(rows.map((row) => row.deletedAt?.getTime()));
    expect(stamps.size).toBe(1);
    expect([...stamps][0]).toEqual(expect.any(Number));
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.pdf.length + SAMPLES.text.length);
  });

  it('hides everything inside from listings, search and downloads', async () => {
    const { docs, work, plan } = await buildTree();
    await alice.delete(`/api/folders/${docs.id}`);

    expect((await alice.get('/api/folders')).body.data.folders).toEqual([]);
    expect((await alice.get(`/api/folders/${work.id}`)).status).toBe(404);
    expect((await alice.get('/api/files?q=plan')).body.data.files).toEqual([]);
    expect((await alice.get(`/api/files/${plan.id}/download`)).status).toBe(404);
  });

  it("can't upload or move things into a trashed folder (404)", async () => {
    const { docs } = await buildTree();
    const loose = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.delete(`/api/folders/${docs.id}`);

    expect((await alice.patch(`/api/files/${loose.id}`).send({ folderId: docs.id })).status).toBe(
      404,
    );
    const upload = await alice
      .post('/api/files/upload')
      .field('folderId', docs.id)
      .attach('files', SAMPLES.png, 'b.png');
    expect(upload.status).toBe(404);
  });
});

describe('the trash page', () => {
  it('shows only top-level items, newest first, with their purge date', async () => {
    const { docs } = await buildTree();
    const loose = await uploadOne(alice, SAMPLES.png, 'loose.png');
    await alice.delete(`/api/files/${loose.id}`);
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.get('/api/trash');

    expect(res.status).toBe(200);
    // Work/, plan.pdf and notes.txt are inside Docs/, so they are not listed separately.
    expect(res.body.data.folders.map((f) => f.name)).toEqual(['Docs']);
    expect(res.body.data.files.map((f) => f.name)).toEqual(['loose.png']);
    expect(res.body.meta.total).toBe(1);

    const [folder] = res.body.data.folders;
    const expectedPurge = new Date(folder.deletedAt).getTime() + 30 * DAY_MS;
    expect(new Date(folder.purgesAt).getTime()).toBe(expectedPurge);
    expect(res.body.data.retentionDays).toBe(30);
  });

  it("never shows another user's trash", async () => {
    await buildTree(bob);
    const bobFile = await uploadOne(bob, SAMPLES.png, 'b.png');
    await bob.delete(`/api/files/${bobFile.id}`);

    const res = await alice.get('/api/trash');

    expect(res.body.data).toMatchObject({ folders: [], files: [] });
  });
});

describe('restoring a folder', () => {
  it('brings back exactly what was trashed with it', async () => {
    const { docs, work, plan, notes } = await buildTree();
    // notes.txt is trashed on its own FIRST, then the whole folder.
    await alice.delete(`/api/files/${notes.id}`);
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.post(`/api/folders/${docs.id}/restore`);

    expect(res.status).toBe(200);
    expect((await folderRow(work.id)).deletedAt).toBeNull();
    expect((await fileRow(plan.id)).deletedAt).toBeNull();
    // Deleted separately before, so it stays in the trash, now listed on its own.
    expect((await fileRow(notes.id)).deletedAt).not.toBeNull();
    const trash = await alice.get('/api/trash');
    expect(trash.body.data.files.map((f) => f.name)).toEqual(['notes.txt']);
  });

  it('comes back at the root when its parent is still in the trash', async () => {
    const { docs, work } = await buildTree();
    await alice.delete(`/api/folders/${work.id}`);
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.post(`/api/folders/${work.id}/restore`);

    expect(res.body.data.folder).toMatchObject({ name: 'Work', parentId: null, deletedAt: null });
  });

  it('renames on a name clash: "Photos (restored)", then "Photos (restored 2)"', async () => {
    const first = await createFolder(alice, 'Photos');
    await alice.delete(`/api/folders/${first.id}`);
    const second = await createFolder(alice, 'Photos');
    await alice.delete(`/api/folders/${second.id}`);
    await createFolder(alice, 'PHOTOS');

    const a = await alice.post(`/api/folders/${first.id}/restore`);
    const b = await alice.post(`/api/folders/${second.id}/restore`);

    expect(a.body.data.folder.name).toBe('Photos (restored)');
    expect(b.body.data.folder.name).toBe('Photos (restored 2)');
  });

  it('is 404 for a folder that is not in the trash, or not mine', async () => {
    const mine = await createFolder(alice, 'Mine');
    const theirs = await createFolder(bob, 'Theirs');
    await bob.delete(`/api/folders/${theirs.id}`);

    expect((await alice.post(`/api/folders/${mine.id}/restore`)).status).toBe(404);
    expect((await alice.post(`/api/folders/${theirs.id}/restore`)).status).toBe(404);
  });
});

describe('deleting a folder forever', () => {
  it('only works on trashed folders', async () => {
    const { docs } = await buildTree();

    expect((await alice.delete(`/api/folders/${docs.id}/permanent`)).status).toBe(404);
  });

  it('removes every file (bytes and rows), every subfolder, and frees the quota', async () => {
    const { docs, work, plan } = await buildTree();
    const keep = await uploadOne(alice, SAMPLES.png, 'keep.png');
    const planKey = (await fileRow(plan.id)).storageKey;
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.delete(`/api/folders/${docs.id}/permanent`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ files: 2, bytes: SAMPLES.pdf.length + SAMPLES.text.length });
    expect(await folderRow(docs.id)).toBeNull();
    expect(await folderRow(work.id)).toBeNull(); // cascaded
    expect(await storage.getMetadata(planKey)).toBeNull();
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.png.length);
    expect(await fileRow(keep.id)).not.toBeNull();
  });

  it('refuses while an upload into it is still in progress (409)', async () => {
    const { docs } = await buildTree();
    await prisma.file.create({
      data: {
        userId: alice.user.id,
        folderId: docs.id,
        originalName: 'incoming.bin',
        storageKey: `users/${alice.user.id}/incoming`,
        mimeType: 'application/pdf',
        category: 'DOCUMENT',
        sizeBytes: 1n,
        status: 'UPLOADING',
      },
    });
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.delete(`/api/folders/${docs.id}/permanent`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UPLOAD_IN_PROGRESS');
  });

  it("can't touch someone else's folder (404)", async () => {
    const theirs = await createFolder(bob, 'Theirs');

    expect((await alice.delete(`/api/folders/${theirs.id}`)).status).toBe(404);
    await bob.delete(`/api/folders/${theirs.id}`);
    expect((await alice.delete(`/api/folders/${theirs.id}/permanent`)).status).toBe(404);
    expect(await folderRow(theirs.id)).not.toBeNull();
  });
});

describe('emptying the trash', () => {
  it('deletes everything in the trash and nothing else', async () => {
    const { docs } = await buildTree();
    const loose = await uploadOne(alice, SAMPLES.png, 'loose.png');
    const keep = await uploadOne(alice, SAMPLES.text, 'keep.txt');
    const bobs = await uploadOne(bob, SAMPLES.png, 'bob.png');
    await bob.delete(`/api/files/${bobs.id}`);
    await alice.delete(`/api/files/${loose.id}`);
    await alice.delete(`/api/folders/${docs.id}`);

    const res = await alice.delete('/api/trash');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ folders: 1, files: 3 });
    expect(await prisma.file.findMany({ where: { userId: alice.user.id } })).toEqual([
      expect.objectContaining({ id: keep.id }),
    ]);
    expect(await storageUsed(alice.user.id)).toBe(SAMPLES.text.length);
    expect(await fileRow(bobs.id)).not.toBeNull(); // Bob's trash is his own business
  });
});
