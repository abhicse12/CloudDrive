import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { api } from './helpers/http.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();
const GIB = 1024 ** 3;

let alice;
let bob;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });
});
afterAll(() => prisma.$disconnect());

const stats = async (client = alice) => (await client.get('/api/dashboard/stats')).body.data;
const category = (data, name) => data.byCategory.find((row) => row.category === name);

describe('GET /api/dashboard/stats', () => {
  it('starts at zero, with every category present', async () => {
    const data = await stats();

    expect(data).toMatchObject({
      storageUsed: 0,
      storageLimit: 5 * GIB,
      remaining: 5 * GIB,
      percentUsed: 0,
      fileCount: 0,
      folderCount: 0,
      trashBytes: 0,
      trashFileCount: 0,
    });
    expect(data.byCategory.map((row) => row.category)).toEqual([
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'DOCUMENT',
      'ARCHIVE',
      'OTHER',
    ]);
    expect(data.byCategory.every((row) => row.count === 0 && row.bytes === 0)).toBe(true);
  });

  it('breaks usage down by category, and the parts add up to storageUsed', async () => {
    await alice.post('/api/folders').send({ name: 'Docs' });
    await uploadOne(alice, SAMPLES.png, 'a.png');
    await uploadOne(alice, SAMPLES.png, 'b.png');
    await uploadOne(alice, SAMPLES.pdf, 'c.pdf');
    const trashed = await uploadOne(alice, SAMPLES.text, 'old.txt');
    await alice.delete(`/api/files/${trashed.id}`);
    await uploadOne(bob, SAMPLES.pdf, 'bob.pdf'); // not Alice's

    const data = await stats();

    expect(category(data, 'IMAGE')).toEqual({
      category: 'IMAGE',
      count: 2,
      bytes: 2 * SAMPLES.png.length,
    });
    expect(category(data, 'DOCUMENT')).toMatchObject({ count: 1, bytes: SAMPLES.pdf.length });
    expect(data).toMatchObject({
      fileCount: 3,
      folderCount: 1,
      trashBytes: SAMPLES.text.length,
      trashFileCount: 1,
    });
    // The dashboard must agree with the quota counter, byte for byte.
    const visibleBytes = data.byCategory.reduce((sum, row) => sum + row.bytes, 0);
    expect(visibleBytes + data.trashBytes).toBe(data.storageUsed);
  });

  it('computes remaining space and percent used (one decimal)', async () => {
    await prisma.user.update({
      where: { id: alice.user.id },
      data: { storageLimit: 1000n, storageUsed: 427n },
    });

    expect(await stats()).toMatchObject({ remaining: 573, percentUsed: 42.7 });
  });

  it('treats a limit of 0 as full instead of dividing by zero', async () => {
    await prisma.user.update({ where: { id: alice.user.id }, data: { storageLimit: 0n } });

    expect(await stats()).toMatchObject({ remaining: 0, percentUsed: 100 });
  });

  it('requires login', async () => {
    expect((await api(app).get('/api/dashboard/stats')).status).toBe(401);
  });
});

describe('GET /api/dashboard/recent-files', () => {
  it('returns my newest files first, without trashed ones, up to the limit', async () => {
    await uploadOne(alice, SAMPLES.png, 'first.png');
    const trashed = await uploadOne(alice, SAMPLES.png, 'trashed.png');
    await uploadOne(alice, SAMPLES.png, 'second.png');
    await uploadOne(alice, SAMPLES.png, 'third.png');
    await alice.delete(`/api/files/${trashed.id}`);
    await uploadOne(bob, SAMPLES.png, 'bob.png');

    const res = await alice.get('/api/dashboard/recent-files?limit=2');

    expect(res.body.data.files.map((f) => f.name)).toEqual(['third.png', 'second.png']);
  });

  it.each(['limit=0', 'limit=51', 'limit=abc', 'sort=name'])('rejects %s (400)', async (q) => {
    expect((await alice.get(`/api/dashboard/recent-files?${q}`)).status).toBe(400);
  });
});

describe('GET /api/dashboard/activity', () => {
  it('lists my own actions, newest first', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.patch(`/api/files/${file.id}`).send({ name: 'b.png' });
    await bob.post('/api/folders').send({ name: 'Bob stuff' });

    const res = await alice.get('/api/dashboard/activity');

    const entries = res.body.data.activity;
    expect(entries.map((e) => e.action)).toEqual(['FILE_RENAMED', 'FILE_UPLOADED']);
    expect(entries[0]).toEqual({
      id: expect.any(String),
      action: 'FILE_RENAMED',
      targetType: 'FILE',
      targetId: file.id,
      metadata: { name: 'b.png', previousName: 'a.png' },
      createdAt: expect.any(String),
    });
  });

  it('pages backwards in time with ?cursor=', async () => {
    for (const name of ['A', 'B', 'C']) await alice.post('/api/folders').send({ name });

    const page1 = (await alice.get('/api/dashboard/activity?limit=2')).body.data;
    const page2 = (await alice.get(`/api/dashboard/activity?limit=2&cursor=${page1.nextCursor}`))
      .body.data;

    expect(page1.activity.map((e) => e.metadata.name)).toEqual(['C', 'B']);
    expect(page2.activity.map((e) => e.metadata.name)).toEqual(['A']);
    expect(page2.nextCursor).toBeNull(); // short page = the end
  });

  it('never skips entries that share a timestamp (bulk actions)', async () => {
    const files = [];
    for (const name of ['1.png', '2.png', '3.png'])
      files.push(await uploadOne(alice, SAMPLES.png, name));
    // One bulk trash = three activity rows with the SAME createdAt.
    await alice.post('/api/files/bulk').send({ action: 'trash', ids: files.map((f) => f.id) });

    const seen = [];
    let cursor = '';
    for (let page = 0; page < 10; page += 1) {
      const res = await alice.get(`/api/dashboard/activity?limit=2${cursor}`);
      const { activity, nextCursor } = res.body.data;
      seen.push(...activity.map((e) => e.id));
      if (!nextCursor) break;
      cursor = `&cursor=${nextCursor}`;
    }

    expect(seen).toHaveLength(6); // 3 uploads + 3 trash entries
    expect(new Set(seen).size).toBe(6);
  });

  it('rejects an invalid cursor (400)', async () => {
    expect((await alice.get('/api/dashboard/activity?cursor=yesterday')).status).toBe(400);
  });
});
