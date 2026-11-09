import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { resetDb } from './helpers/db.js';
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
afterAll(() => prisma.$disconnect());

async function createFolder(client, name, parentId) {
  const res = await client.post('/api/folders').send({ name, parentId });
  expect(res.status).toBe(201);
  return res.body.data.folder;
}

describe('creating and listing', () => {
  it('creates folders at the root and inside other folders', async () => {
    const docs = await createFolder(alice, 'Documents');
    const work = await createFolder(alice, 'Work', docs.id);

    const root = await alice.get('/api/folders');
    const inside = await alice.get(`/api/folders?parentId=${docs.id}`);

    expect(root.body.data.folders.map((f) => f.name)).toEqual(['Documents']);
    expect(inside.body.data.folders).toEqual([expect.objectContaining({ id: work.id })]);
  });

  it('trims names and records the action in the activity log', async () => {
    const folder = await createFolder(alice, '  Photos  ');

    expect(folder.name).toBe('Photos');
    const log = await prisma.activityLog.findFirst({ where: { targetId: folder.id } });
    expect(log).toMatchObject({ action: 'FOLDER_CREATED', metadata: { name: 'Photos' } });
  });

  it('rejects a duplicate name in the same place, ignoring case (409)', async () => {
    await createFolder(alice, 'Photos');

    const res = await alice.post('/api/folders').send({ name: 'PHOTOS' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FOLDER_NAME_TAKEN');
  });

  it('allows the same name in different folders, and for different users', async () => {
    const docs = await createFolder(alice, 'Documents');
    await createFolder(alice, 'Photos');

    expect(
      (await alice.post('/api/folders').send({ name: 'Photos', parentId: docs.id })).status,
    ).toBe(201);
    expect((await bob.post('/api/folders').send({ name: 'Photos' })).status).toBe(201);
  });

  it.each(['', '   ', 'a/b', 'a\\b', '..', 'bad\u0000name', 'x'.repeat(256)])(
    'rejects the invalid name %j',
    async (name) => {
      const res = await alice.post('/api/folders').send({ name });

      expect(res.status).toBe(400);
    },
  );

  it('sorts by the requested field', async () => {
    await createFolder(alice, 'Banana');
    await createFolder(alice, 'apple');
    await createFolder(alice, 'Cherry');

    const res = await alice.get('/api/folders?sortBy=name&sortOrder=desc');

    // Alphabetical regardless of case (ICU collation), not byte order ("Cherry, Banana, apple").
    expect(res.body.data.folders.map((f) => f.name)).toEqual(['Cherry', 'Banana', 'apple']);
  });
});

describe('breadcrumbs and tree', () => {
  it('returns the path from the root to the folder', async () => {
    const docs = await createFolder(alice, 'Documents');
    const work = await createFolder(alice, 'Work', docs.id);
    const year = await createFolder(alice, '2026', work.id);

    const res = await alice.get(`/api/folders/${year.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.breadcrumbs.map((b) => b.name)).toEqual(['Documents', 'Work', '2026']);
  });

  it('returns every folder for the move picker, but only my own', async () => {
    const docs = await createFolder(alice, 'Documents');
    await createFolder(alice, 'Work', docs.id);
    await createFolder(bob, 'Bob secret');

    const res = await alice.get('/api/folders/tree');

    expect(res.body.data.folders.map((f) => f.name).sort()).toEqual(['Documents', 'Work']);
  });
});

describe('rename and move', () => {
  it('renames a folder', async () => {
    const folder = await createFolder(alice, 'Old');

    const res = await alice.patch(`/api/folders/${folder.id}`).send({ name: 'New' });

    expect(res.status).toBe(200);
    expect(res.body.data.folder.name).toBe('New');
  });

  it('moves a folder into another one, and back to the root', async () => {
    const a = await createFolder(alice, 'A');
    const b = await createFolder(alice, 'B');

    const moved = await alice.patch(`/api/folders/${b.id}`).send({ parentId: a.id });
    expect(moved.body.data.folder.parentId).toBe(a.id);

    const back = await alice.patch(`/api/folders/${b.id}`).send({ parentId: null });
    expect(back.body.data.folder.parentId).toBeNull();
  });

  it('refuses to move a folder into itself or its own descendant (no loops)', async () => {
    const a = await createFolder(alice, 'A');
    const b = await createFolder(alice, 'B', a.id);
    const c = await createFolder(alice, 'C', b.id);

    const intoSelf = await alice.patch(`/api/folders/${a.id}`).send({ parentId: a.id });
    const intoGrandchild = await alice.patch(`/api/folders/${a.id}`).send({ parentId: c.id });

    expect(intoSelf.status).toBe(400);
    expect(intoGrandchild.status).toBe(400);
    expect(intoGrandchild.body.error.code).toBe('INVALID_MOVE');
  });

  it('rejects a move that would create a duplicate name (409)', async () => {
    const dest = await createFolder(alice, 'Dest');
    await createFolder(alice, 'Photos', dest.id);
    const photos = await createFolder(alice, 'Photos');

    const res = await alice.patch(`/api/folders/${photos.id}`).send({ parentId: dest.id });

    expect(res.status).toBe(409);
  });

  it('requires at least one field', async () => {
    const folder = await createFolder(alice, 'X');

    const res = await alice.patch(`/api/folders/${folder.id}`).send({});

    expect(res.status).toBe(400);
  });
});

describe('ownership (IDOR protection)', () => {
  it("returns 404 for another user's folder, everywhere", async () => {
    const secret = await createFolder(bob, 'Bob secret');

    const results = await Promise.all([
      alice.get(`/api/folders/${secret.id}`),
      alice.get(`/api/folders?parentId=${secret.id}`),
      alice.patch(`/api/folders/${secret.id}`).send({ name: 'Hacked' }),
      alice.post('/api/folders').send({ name: 'Inside', parentId: secret.id }),
    ]);

    results.forEach((res) => expect(res.status).toBe(404));
    const unchanged = await prisma.folder.findUnique({ where: { id: secret.id } });
    expect(unchanged.name).toBe('Bob secret');
  });

  it("can't move my folder into someone else's folder", async () => {
    const mine = await createFolder(alice, 'Mine');
    const theirs = await createFolder(bob, 'Theirs');

    const res = await alice.patch(`/api/folders/${mine.id}`).send({ parentId: theirs.id });

    expect(res.status).toBe(404);
  });

  it('requires login', async () => {
    expect((await api(app).get('/api/folders')).status).toBe(401);
  });

  it('rejects malformed IDs with 400 before touching the database', async () => {
    expect((await alice.get('/api/folders/not-a-uuid')).status).toBe(400);
  });
});
