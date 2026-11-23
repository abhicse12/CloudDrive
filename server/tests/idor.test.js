/**
 * IDOR (Insecure Direct Object Reference) sweep: Bob tries every owner endpoint with
 * the IDs of Alice's things. The rule (Â§8): another user's resource must look exactly
 * like one that doesn't exist. So each answer is compared with the answer for a random
 * UUID: same status, same error body. Afterwards Alice's data must be untouched.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, upload, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let alice;
let bob;
const A = {}; // Alice's IDs
const B = {}; // Bob's IDs

/** Everything of Alice's that an attack could change, to compare before/after. */
async function aliceSnapshot() {
  const userId = alice.user.id;
  const [user, files, folders, shares] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true, status: true, storageUsed: true, storageLimit: true },
    }),
    prisma.file.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    prisma.folder.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    prisma.share.findMany({ where: { file: { userId } }, orderBy: { id: 'asc' } }),
  ]);
  return { user, files, folders, shares };
}

let before;

beforeAll(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });

  // Alice: Docs/Work, a file inside Docs, a root file, a trashed file, a trashed
  // folder (with a file), a share link, and activity entries from all of that.
  const folder = async (client, name, parentId) =>
    (await client.post('/api/folders').send({ name, parentId })).body.data.folder.id;
  A.folder = await folder(alice, 'Docs');
  A.child = await folder(alice, 'Work', A.folder);
  A.file = (await uploadOne(alice, SAMPLES.pdf, 'secret.pdf', { folderId: A.folder })).id;
  A.rootFile = (await uploadOne(alice, SAMPLES.png, 'photo.png')).id;
  A.trashedFile = (await uploadOne(alice, SAMPLES.text, 'old.txt')).id;
  await alice.delete(`/api/files/${A.trashedFile}`);
  A.trashedFolder = await folder(alice, 'Archive');
  await uploadOne(alice, SAMPLES.text, 'inside.txt', { folderId: A.trashedFolder });
  await alice.delete(`/api/folders/${A.trashedFolder}`);
  A.share = (await alice.post(`/api/files/${A.file}/share`).send({})).body.data.share.id;
  A.activity = (await prisma.activityLog.findFirst({ where: { userId: alice.user.id } })).id;

  B.folder = await folder(bob, 'Mine');
  B.file = (await uploadOne(bob, SAMPLES.png, 'bob.png')).id;

  before = await aliceSnapshot();
});

afterAll(() => prisma.$disconnect());

/*
 * [label, (id) => request]. Each is sent with Alice's ID and with a random UUID; the
 * two answers must match exactly (apart from the request ID).
 */
const BY_ID = [
  // Files
  ['GET file', (id) => bob.get(`/api/files/${id}`), () => A.file],
  ['GET file download link', (id) => bob.get(`/api/files/${id}/download`), () => A.file],
  ['rename file', (id) => bob.patch(`/api/files/${id}`).send({ name: 'x.pdf' }), () => A.file],
  ['trash file', (id) => bob.delete(`/api/files/${id}`), () => A.file],
  ['restore file', (id) => bob.post(`/api/files/${id}/restore`), () => A.trashedFile],
  ['delete file forever', (id) => bob.delete(`/api/files/${id}/permanent`), () => A.trashedFile],
  ['share file', (id) => bob.post(`/api/files/${id}/share`).send({}), () => A.file],
  ['list files in folder', (id) => bob.get(`/api/files?folderId=${id}`), () => A.folder],
  [
    'move own file INTO their folder',
    (id) => bob.patch(`/api/files/${B.file}`).send({ folderId: id }),
    () => A.folder,
  ],
  [
    'bulk-move own file INTO their folder',
    (id) => bob.post('/api/files/bulk').send({ action: 'move', ids: [B.file], folderId: id }),
    () => A.folder,
  ],
  [
    'upload INTO their folder',
    (id) => upload(bob, [{ content: SAMPLES.png, name: 'x.png' }], { folderId: id }),
    () => A.folder,
  ],
  // Folders
  ['list subfolders', (id) => bob.get(`/api/folders?parentId=${id}`), () => A.folder],
  ['GET folder', (id) => bob.get(`/api/folders/${id}`), () => A.folder],
  ['rename folder', (id) => bob.patch(`/api/folders/${id}`).send({ name: 'x' }), () => A.folder],
  [
    'move own folder INTO their folder',
    (id) => bob.patch(`/api/folders/${B.folder}`).send({ parentId: id }),
    () => A.folder,
  ],
  [
    'create folder INSIDE their folder',
    (id) => bob.post('/api/folders').send({ name: 'x', parentId: id }),
    () => A.folder,
  ],
  ['trash folder', (id) => bob.delete(`/api/folders/${id}`), () => A.folder],
  ['restore folder', (id) => bob.post(`/api/folders/${id}/restore`), () => A.trashedFolder],
  [
    'delete folder forever',
    (id) => bob.delete(`/api/folders/${id}/permanent`),
    () => A.trashedFolder,
  ],
  // Shares
  ['GET share', (id) => bob.get(`/api/shares/${id}`), () => A.share],
  ['revoke share', (id) => bob.delete(`/api/shares/${id}`), () => A.share],
  ['regenerate share', (id) => bob.post(`/api/shares/${id}/regenerate`), () => A.share],
];

const answer = (res) => ({ status: res.status, error: res.body?.error });

describe("another user's IDs look exactly like IDs that don't exist", () => {
  it.each(BY_ID)('%s', async (_label, send, aliceId) => {
    const theirs = answer(await send(aliceId()));
    const missing = answer(await send(randomUUID()));

    expect(theirs.status).toBe(404);
    expect(theirs).toEqual(missing);
  });
});

describe('lists and bulk actions only ever touch your own things', () => {
  it('bulk trash / restore / delete skip foreign IDs (affected: 0)', async () => {
    for (const [action, ids] of [
      ['trash', [A.file, A.rootFile]],
      ['restore', [A.trashedFile]],
      ['delete', [A.trashedFile]],
    ]) {
      const res = await bob.post('/api/files/bulk').send({ action, ids });
      expect(res.status).toBe(200);
      expect(res.body.data.affected).toBe(0);
    }
  });

  it('file lists and search never include them', async () => {
    const names = async (url) => (await bob.get(url)).body.data.files.map((f) => f.name);

    expect(await names('/api/files?folderId=all')).toEqual(['bob.png']);
    expect(await names('/api/files?q=secret')).toEqual([]);
    expect(await names('/api/files?q=.')).toEqual(['bob.png']);
  });

  it('folders, the folder tree and the trash list only mine', async () => {
    expect((await bob.get('/api/folders')).body.data.folders.map((f) => f.name)).toEqual(['Mine']);
    expect((await bob.get('/api/folders/tree')).body.data.folders.map((f) => f.name)).toEqual([
      'Mine',
    ]);
    const trash = (await bob.get('/api/trash')).body.data;
    expect([...trash.files, ...trash.folders]).toEqual([]);
  });

  it('emptying my trash leaves theirs alone', async () => {
    expect((await bob.delete('/api/trash')).status).toBe(200);
    expect(await prisma.file.findUnique({ where: { id: A.trashedFile } })).not.toBeNull();
  });

  it('my share list has none of theirs', async () => {
    expect((await bob.get('/api/shares')).body.data.shares).toEqual([]);
  });

  it('dashboard numbers, recent files and activity are mine only', async () => {
    const stats = (await bob.get('/api/dashboard/stats')).body.data;
    expect(stats.fileCount).toBe(1);
    expect(stats.storageUsed).toBe(SAMPLES.png.length);

    const recent = (await bob.get('/api/dashboard/recent-files')).body.data.files;
    expect(recent.map((f) => f.name)).toEqual(['bob.png']);

    const entries = async (url) => (await bob.get(url)).body.data.activity ?? [];
    const feed = await entries('/api/dashboard/activity?limit=50');
    expect(feed.length).toBeGreaterThan(0);
    const mine = new Set(
      (await prisma.activityLog.findMany({ where: { userId: bob.user.id } })).map((e) => e.id),
    );
    expect(feed.every((entry) => mine.has(entry.id))).toBe(true);

    // Using one of Alice's entries as the paging cursor must not leak her entries.
    const res = await bob.get(`/api/dashboard/activity?limit=50&cursor=${A.activity}`);
    if (res.status === 200) {
      expect((res.body.data.activity ?? []).every((entry) => mine.has(entry.id))).toBe(true);
    } else {
      expect([400, 404]).toContain(res.status);
    }
  });

  it("profile updates can't target someone else", async () => {
    const res = await bob.patch('/api/auth/me').send({ name: 'Hacked', id: alice.user.id });
    expect(res.status).toBe(400); // unknown field rejected, nothing changed
  });
});

describe('admin endpoints are closed to normal users (403)', () => {
  it.each([
    ['GET stats', () => bob.get('/api/admin/stats')],
    ['GET users', () => bob.get('/api/admin/users')],
    ['PATCH user', () => bob.patch(`/api/admin/users/${alice.user.id}`).send({ role: 'USER' })],
    ['promote self', () => bob.patch(`/api/admin/users/${bob.user.id}`).send({ role: 'ADMIN' })],
  ])('%s', async (_label, send) => {
    const res = await send();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('after all of that', () => {
  it("Alice's data is exactly as it was", async () => {
    expect(await aliceSnapshot()).toEqual(before);
    expect((await prisma.user.findUnique({ where: { id: bob.user.id } })).role).toBe('USER');
  });
});
