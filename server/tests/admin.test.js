import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { adminRepository } from '../src/repositories/admin.repository.js';
import { adminService } from '../src/services/admin.service.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { api } from './helpers/http.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let admin;
let alice;
let bob;

const setUser = (client, data) => prisma.user.update({ where: { id: client.user.id }, data });
const userRow = (client) => prisma.user.findUnique({ where: { id: client.user.id } });

/** Registers a user and makes them an admin. The role is read from the DB per request. */
async function newAdmin(name) {
  const client = await loginAsNewUser(app, { name });
  await setUser(client, { role: 'ADMIN' });
  return client;
}

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  admin = await newAdmin('Admin');
  alice = await loginAsNewUser(app, { name: 'Alice' });
  bob = await loginAsNewUser(app, { name: 'Bob' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const patchUser = (client, target, body) =>
  client.patch(`/api/admin/users/${target.user?.id ?? target}`).send(body);

const auditLogs = () => prisma.activityLog.findMany({ where: { action: 'ADMIN_USER_UPDATED' } });

describe('access control', () => {
  it('needs login (401) and the ADMIN role (403)', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);

    expect((await alice.get('/api/admin/users')).status).toBe(403);
    const patch = await patchUser(alice, alice, { role: 'ADMIN' });
    expect(patch.status).toBe(403);
    expect((await userRow(alice)).role).toBe('USER');

    expect((await admin.get('/api/admin/users')).status).toBe(200);
  });

  it('takes effect immediately when the role changes', async () => {
    await patchUser(admin, alice, { role: 'ADMIN' });
    expect((await alice.get('/api/admin/users')).status).toBe(200);

    await patchUser(admin, alice, { role: 'USER' });
    expect((await alice.get('/api/admin/users')).status).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  it('lists every user with usage and file count, never secrets', async () => {
    await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    await uploadOne(alice, SAMPLES.png, 'b.png');
    const trashed = await uploadOne(alice, SAMPLES.png, 'c.png');
    await alice.delete(`/api/files/${trashed.id}`);

    const res = await admin.get('/api/admin/users?sortBy=name&sortOrder=asc');

    expect(res.status).toBe(200);
    const users = res.body.data.users;
    expect(users.map((u) => u.name)).toEqual(['Admin', 'Alice', 'Bob']);
    expect(users[1]).toMatchObject({
      email: alice.user.email,
      role: 'USER',
      status: 'ACTIVE',
      fileCount: 2, // the trashed file isn't counted...
      storageUsed: SAMPLES.pdf.length + 2 * SAMPLES.png.length, // ...but still uses space
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('searches name and email, case-insensitive, with % taken literally', async () => {
    const names = async (q) =>
      (await admin.get(`/api/admin/users?q=${encodeURIComponent(q)}`)).body.data.users.map(
        (u) => u.name,
      );

    expect(await names('ALI')).toEqual(['Alice']);
    expect(await names(alice.user.email.slice(0, 8))).toEqual(['Alice']);
    expect(await names('%')).toEqual([]);
  });

  it('filters by role and status, sorts by usage, paginates', async () => {
    await uploadOne(bob, SAMPLES.pdf, 'big.pdf');
    await setUser(alice, { status: 'SUSPENDED' });

    const list = async (query) =>
      (await admin.get(`/api/admin/users?${query}`)).body.data.users.map((u) => u.name);

    expect(await list('role=ADMIN')).toEqual(['Admin']);
    expect(await list('status=SUSPENDED')).toEqual(['Alice']);
    expect((await list('sortBy=storageUsed&sortOrder=desc'))[0]).toBe('Bob');

    const page = await admin.get('/api/admin/users?pageSize=2&page=2');
    expect(page.body.data.users).toHaveLength(1);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

    expect((await admin.get('/api/admin/users?role=OWNER')).status).toBe(400);
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('changes role, status and limit, and audit-logs exactly what changed', async () => {
    const res = await patchUser(admin, alice, {
      role: 'ADMIN',
      storageLimit: 1024 ** 3,
      status: 'ACTIVE', // unchanged: not part of the log
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ role: 'ADMIN', storageLimit: 1024 ** 3 });

    const [log] = await auditLogs();
    expect(log).toMatchObject({
      userId: admin.user.id,
      targetType: 'ACCOUNT',
      targetId: alice.user.id,
    });
    expect(log.metadata.changes).toEqual({
      role: { from: 'USER', to: 'ADMIN' },
      storageLimit: { from: 5 * 1024 ** 3, to: 1024 ** 3 },
    });
  });

  it('does nothing (and logs nothing) when nothing changes', async () => {
    const res = await patchUser(admin, alice, { role: 'USER', status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(await auditLogs()).toHaveLength(0);
  });

  it('validates the body: known fields only, sane limits', async () => {
    for (const body of [
      {},
      { email: 'x@example.com' },
      { storageUsed: 0 },
      { role: 'OWNER' },
      { storageLimit: -1 },
      { storageLimit: 1.5 },
      { storageLimit: '100' },
    ]) {
      expect((await patchUser(admin, alice, body)).status).toBe(400);
    }
  });

  it('is 404 for an unknown user', async () => {
    expect((await patchUser(admin, randomUUID(), { role: 'ADMIN' })).status).toBe(404);
  });

  it("won't let admins demote or suspend themselves, but they can change their own limit", async () => {
    for (const body of [{ role: 'USER' }, { status: 'SUSPENDED' }]) {
      const res = await patchUser(admin, admin, body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ACCESS');
    }
    expect(await userRow(admin)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });

    expect((await patchUser(admin, admin, { storageLimit: 10 * 1024 ** 3 })).status).toBe(200);
  });

  it('suspending logs the user out everywhere and pauses their share links', async () => {
    const file = await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    const shared = await alice.post(`/api/files/${file.id}/share`).send({});
    const token = shared.body.data.url.split('/s/')[1];

    expect((await patchUser(admin, alice, { status: 'SUSPENDED' })).status).toBe(200);

    expect((await alice.get('/api/auth/me')).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: alice.user.id, revokedAt: null } })).toBe(
      0,
    );
    expect((await api(app).get(`/api/public/shares/${token}`)).status).toBe(404);

    // Reactivated: the link works again (alice has to log in again herself).
    await patchUser(admin, alice, { status: 'ACTIVE' });
    expect((await api(app).get(`/api/public/shares/${token}`)).status).toBe(200);
    expect((await alice.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses a storage limit below current usage (409), atomically', async () => {
    await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    const used = SAMPLES.pdf.length;

    const res = await patchUser(admin, alice, { role: 'ADMIN', storageLimit: used - 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_BELOW_USAGE');
    // Nothing from that request was applied, not even the role.
    expect(await userRow(alice)).toMatchObject({ role: 'USER', storageLimit: 5n * 1024n ** 3n });
    expect(await auditLogs()).toHaveLength(0);

    // Exactly the current usage is fine: the user just can't upload more.
    expect((await patchUser(admin, alice, { storageLimit: used })).status).toBe(200);
  });
});

describe('the last active admin', () => {
  it("can't be demoted or suspended by anyone", async () => {
    // Through the API an admin can only demote OTHERS, so there is always one left. The
    // rule itself is checked on the service: someone else removing the only admin.
    for (const changes of [{ role: 'USER' }, { status: 'SUSPENDED' }]) {
      await expect(
        adminService.updateUser(alice.user.id, admin.user.id, changes),
      ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_ADMIN' });
    }
    expect(await userRow(admin)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('a suspended admin does not count as a remaining admin', async () => {
    const other = await newAdmin('Other');
    await setUser(other, { status: 'SUSPENDED' });

    await expect(
      adminService.updateUser(alice.user.id, admin.user.id, { role: 'USER' }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  it('two admins demoting each other at once: one succeeds, one admin remains', async () => {
    const second = await newAdmin('Second');

    // Try to force the overlap: each request waits (up to 300 ms) for the other one to
    // finish its admin check too. Without the row lock, both read "2 admins", both
    // pass and both demote. With it, the second request is blocked inside Postgres
    // until the first commits, so it can't arrive early, and sees the new state.
    const realLock = adminRepository.lockActiveAdmins.bind(adminRepository);
    let arrived = 0;
    let release;
    const bothChecked = new Promise((resolve) => (release = resolve));
    vi.spyOn(adminRepository, 'lockActiveAdmins').mockImplementation(async (...args) => {
      const result = await realLock(...args);
      arrived += 1;
      if (arrived === 2) release();
      await Promise.race([bothChecked, new Promise((resolve) => setTimeout(resolve, 300))]);
      return result;
    });

    const results = await Promise.all([
      patchUser(admin, second, { role: 'USER' }),
      patchUser(second, admin, { role: 'USER' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('LAST_ADMIN');
    expect(await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).toBe(1);
  });
});

describe('GET /api/admin/stats', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const utcDate = (date) => date.toISOString().slice(0, 10);

  it('is for admins only', async () => {
    expect((await alice.get('/api/admin/stats')).status).toBe(403);
  });

  it('counts users, files, storage and working share links', async () => {
    await setUser(bob, { status: 'SUSPENDED' });

    const pdf = await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    const png = await uploadOne(alice, SAMPLES.png, 'b.png');
    await alice.delete(`/api/files/${png.id}`); // trashed: not a file, but still storage
    // An upload still in progress must not count as a file.
    await prisma.file.create({
      data: {
        userId: alice.user.id,
        originalName: 'half.bin',
        storageKey: `test/${randomUUID()}`,
        mimeType: 'application/octet-stream',
        category: 'OTHER',
        sizeBytes: 999n,
        status: 'UPLOADING',
      },
    });

    const shareOf = async (fileId) =>
      (await alice.post(`/api/files/${fileId}/share`).send({})).body.data.share;
    await shareOf(pdf.id); // works
    const revoked = await shareOf(pdf.id);
    await alice.delete(`/api/shares/${revoked.id}`);
    const pngFile = await uploadOne(alice, SAMPLES.png, 'c.png');
    await shareOf(pngFile.id);
    await alice.delete(`/api/files/${pngFile.id}`); // paused: file in trash

    const res = await admin.get('/api/admin/stats');

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.users).toEqual({ total: 3, active: 2, suspended: 1, admins: 1 });
    expect(data.files).toEqual({ count: 1, bytes: SAMPLES.pdf.length });
    expect(data.storage).toEqual({
      used: SAMPLES.pdf.length + 2 * SAMPLES.png.length,
      allocated: 3 * 5 * 1024 ** 3,
    });
    expect(data.activeShares).toBe(1);

    expect(data.byCategory.map((row) => row.category)).toEqual([
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'DOCUMENT',
      'ARCHIVE',
      'OTHER',
    ]);
    expect(data.byCategory.find((row) => row.category === 'DOCUMENT')).toEqual({
      category: 'DOCUMENT',
      count: 1,
      bytes: SAMPLES.pdf.length,
    });
    expect(data.byCategory.find((row) => row.category === 'OTHER').count).toBe(0);
  });

  it('gives sign-ups for each of the last 30 UTC days, zeros included', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS);
    await setUser(alice, { createdAt: tenDaysAgo });
    await setUser(bob, { createdAt: new Date(Date.now() - 40 * DAY_MS) }); // too old

    const { signups } = (await admin.get('/api/admin/stats')).body.data;

    expect(signups.days).toHaveLength(30);
    expect(signups.days.at(-1)).toEqual({ date: utcDate(new Date()), count: 1 }); // admin
    expect(signups.days[0].date).toBe(utcDate(new Date(Date.now() - 29 * DAY_MS)));
    expect(signups.days.find((d) => d.date === utcDate(tenDaysAgo)).count).toBe(1);
    expect(signups.total).toBe(2);
  });

  it('lists the top users by storage used', async () => {
    await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    await uploadOne(alice, SAMPLES.png, 'b.png');
    await uploadOne(bob, SAMPLES.png, 'c.png');

    const { topUsers } = (await admin.get('/api/admin/stats')).body.data;

    expect(topUsers.map((u) => u.name)).toEqual(['Alice', 'Bob', 'Admin']);
    expect(topUsers[0]).toMatchObject({
      storageUsed: SAMPLES.pdf.length + SAMPLES.png.length,
      fileCount: 2,
    });
    expect(JSON.stringify(topUsers)).not.toMatch(/password/i);
  });
});
