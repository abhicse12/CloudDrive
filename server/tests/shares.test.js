import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { shareRepository } from '../src/repositories/share.repository.js';
import { hashToken } from '../src/services/token.service.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

const share = (client, fileId, body = {}) => client.post(`/api/files/${fileId}/share`).send(body);

/** Creates a share and returns { share, url, token }. */
async function createShare(client, fileId, body) {
  const res = await share(client, fileId, body);
  if (res.status !== 201) throw new Error(`Share failed: ${JSON.stringify(res.body)}`);
  const { url } = res.body.data;
  return { ...res.body.data, token: url.split('/s/')[1] };
}

const expireInDb = (id) =>
  prisma.share.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

const logsOf = (action) => prisma.activityLog.findMany({ where: { action } });

describe('POST /api/files/:id/share', () => {
  it('returns the link once and stores only the hash of its token', async () => {
    const file = await uploadOne(alice, SAMPLES.pdf, 'plan.pdf');

    const res = await share(alice, file.id, { expiresIn: '1d' });

    expect(res.status).toBe(201);
    const { share: dto, url } = res.body.data;
    expect(url.startsWith(`${env.APP_URL}/s/`)).toBe(true);
    const token = url.split('/s/')[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url

    expect(dto).toMatchObject({
      status: 'active',
      accessCount: 0,
      revokedAt: null,
      fileAvailable: true,
      file: { id: file.id, name: 'plan.pdf', size: SAMPLES.pdf.length },
    });
    const expiresIn = new Date(dto.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(DAY_MS - 60_000);
    expect(expiresIn).toBeLessThanOrEqual(DAY_MS);

    const row = await prisma.share.findUnique({ where: { id: dto.id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(res.body)).not.toContain(row.tokenHash);
  });

  it('defaults to 7 days, and "never" means no expiry', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    const week = await createShare(alice, file.id);
    const forever = await createShare(alice, file.id, { expiresIn: 'never' });

    const weekMs = new Date(week.share.expiresAt).getTime() - Date.now();
    expect(weekMs).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(forever.share.expiresAt).toBeNull();
    expect(forever.token).not.toBe(week.token);
  });

  it('rejects unknown expiry values and extra fields', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    expect((await share(alice, file.id, { expiresIn: '2y' })).status).toBe(400);
    expect((await share(alice, file.id, { expiresAt: '2030-01-01' })).status).toBe(400);
  });

  it("is 404 for someone else's file and for a trashed file", async () => {
    const theirs = await uploadOne(bob, SAMPLES.png, 'b.png');
    const trashed = await uploadOne(alice, SAMPLES.png, 'a.png');
    await alice.delete(`/api/files/${trashed.id}`);

    expect((await share(alice, theirs.id)).status).toBe(404);
    expect((await share(alice, trashed.id)).status).toBe(404);
    expect(await prisma.share.count()).toBe(0);
  });

  it('records the event in the activity feed', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    const [log] = await logsOf('SHARE_CREATED');
    expect(log).toMatchObject({ userId: alice.user.id, targetType: 'SHARE', targetId: dto.id });
    expect(log.metadata).toMatchObject({ name: 'a.png', fileId: file.id });
  });

  it('marks the file as shared only while it has a working link', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const isShared = async () =>
      (await alice.get('/api/files')).body.data.files.find((f) => f.id === file.id).isShared;

    expect(await isShared()).toBe(false);
    const { share: dto } = await createShare(alice, file.id);
    expect(await isShared()).toBe(true);
    expect((await alice.get(`/api/files/${file.id}`)).body.data.file.isShared).toBe(true);

    await expireInDb(dto.id);
    expect(await isShared()).toBe(false);
  });
});

describe('GET /api/shares', () => {
  it('lists only my shares, newest first, with file info and status', async () => {
    const a = await uploadOne(alice, SAMPLES.png, 'a.png');
    const b = await uploadOne(alice, SAMPLES.pdf, 'b.pdf');
    await createShare(alice, a.id);
    await createShare(alice, b.id);
    const theirs = await uploadOne(bob, SAMPLES.png, 'theirs.png');
    await createShare(bob, theirs.id);

    const res = await alice.get('/api/shares');

    expect(res.status).toBe(200);
    expect(res.body.data.shares.map((s) => s.file.name)).toEqual(['b.pdf', 'a.png']);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash|token_hash/);
  });

  it('filters by status: active, expired, revoked never overlap', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const active = await createShare(alice, file.id);
    const expired = await createShare(alice, file.id);
    const revoked = await createShare(alice, file.id);
    await expireInDb(expired.share.id);
    await alice.delete(`/api/shares/${revoked.share.id}`);
    // Expired AND revoked counts as revoked.
    await expireInDb(revoked.share.id);

    const ids = async (status) =>
      (await alice.get(`/api/shares?status=${status}`)).body.data.shares.map((s) => s.id);

    expect(await ids('active')).toEqual([active.share.id]);
    expect(await ids('expired')).toEqual([expired.share.id]);
    expect(await ids('revoked')).toEqual([revoked.share.id]);
    expect((await alice.get('/api/shares?status=bogus')).status).toBe(400);
  });

  it('flags shares whose file is in trash, and drops them when it is deleted for good', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    await alice.delete(`/api/files/${file.id}`);
    const [listed] = (await alice.get('/api/shares')).body.data.shares;
    expect(listed).toMatchObject({ id: dto.id, status: 'active', fileAvailable: false });

    await alice.delete(`/api/files/${file.id}/permanent`);
    expect((await alice.get('/api/shares')).body.data.shares).toEqual([]);
    expect((await alice.get(`/api/shares/${dto.id}`)).status).toBe(404);
  });

  it('paginates', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    for (let i = 0; i < 3; i += 1) await createShare(alice, file.id);

    const res = await alice.get('/api/shares?pageSize=2&page=2');

    expect(res.body.data.shares).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });
});

describe('GET /api/shares/:id', () => {
  it("returns my share and 404s for someone else's", async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    const mine = await alice.get(`/api/shares/${dto.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.share).toEqual(dto);

    expect((await bob.get(`/api/shares/${dto.id}`)).status).toBe(404);
    expect((await alice.get('/api/shares/not-a-uuid')).status).toBe(400);
  });
});

describe('DELETE /api/shares/:id (revoke)', () => {
  it('revokes the link and logs it once, even when repeated', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    expect((await alice.delete(`/api/shares/${dto.id}`)).status).toBe(204);
    const first = await prisma.share.findUnique({ where: { id: dto.id } });
    expect(first.revokedAt).not.toBeNull();

    expect((await alice.delete(`/api/shares/${dto.id}`)).status).toBe(204);
    const second = await prisma.share.findUnique({ where: { id: dto.id } });
    expect(second.revokedAt).toEqual(first.revokedAt);

    expect(await logsOf('SHARE_REVOKED')).toHaveLength(1);
    expect((await alice.get(`/api/shares/${dto.id}`)).body.data.share.status).toBe('revoked');
  });

  it("can't revoke someone else's link (404, and it keeps working)", async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    expect((await bob.delete(`/api/shares/${dto.id}`)).status).toBe(404);

    const row = await prisma.share.findUnique({ where: { id: dto.id } });
    expect(row.revokedAt).toBeNull();
    expect(await logsOf('SHARE_REVOKED')).toHaveLength(0);
  });
});

describe('POST /api/shares/:id/regenerate', () => {
  it('revokes the old link and issues a new one with the same expiry', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const old = await createShare(alice, file.id, { expiresIn: '30d' });

    const res = await alice.post(`/api/shares/${old.share.id}/regenerate`);

    expect(res.status).toBe(201);
    const { share: next, url } = res.body.data;
    expect(next.id).not.toBe(old.share.id);
    expect(url).not.toBe(old.url);
    expect(next.expiresAt).toBe(old.share.expiresAt);
    expect(next).toMatchObject({ status: 'active', accessCount: 0, file: { id: file.id } });

    const oldRow = await prisma.share.findUnique({ where: { id: old.share.id } });
    expect(oldRow.revokedAt).not.toBeNull();
    const newRow = await prisma.share.findUnique({ where: { id: next.id } });
    expect(newRow.tokenHash).toBe(hashToken(url.split('/s/')[1]));

    expect(await logsOf('SHARE_REVOKED')).toHaveLength(1);
    expect(await logsOf('SHARE_CREATED')).toHaveLength(2);
  });

  it('refuses revoked or expired links and links to trashed files (409)', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const revoked = await createShare(alice, file.id);
    const expired = await createShare(alice, file.id);
    const paused = await createShare(alice, file.id);
    await alice.delete(`/api/shares/${revoked.share.id}`);
    await expireInDb(expired.share.id);

    for (const { share: dto } of [revoked, expired]) {
      const res = await alice.post(`/api/shares/${dto.id}/regenerate`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SHARE_NOT_ACTIVE');
    }

    await alice.delete(`/api/files/${file.id}`);
    expect((await alice.post(`/api/shares/${paused.share.id}/regenerate`)).status).toBe(409);
  });

  it("is 404 for someone else's link", async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    expect((await bob.post(`/api/shares/${dto.id}/regenerate`)).status).toBe(404);
    expect(await prisma.share.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('two overlapping regenerates create exactly one new link', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { share: dto } = await createShare(alice, file.id);

    // Force the overlap: both requests must pass the "is it active?" check before
    // either one revokes, otherwise the test could pass just by timing luck.
    const realFindOwned = shareRepository.findOwned.bind(shareRepository);
    let arrived = 0;
    let release;
    const bothArrived = new Promise((resolve) => (release = resolve));
    vi.spyOn(shareRepository, 'findOwned').mockImplementation(async (...args) => {
      const result = await realFindOwned(...args);
      arrived += 1;
      if (arrived === 2) release();
      await bothArrived;
      return result;
    });

    const results = await Promise.all([
      alice.post(`/api/shares/${dto.id}/regenerate`),
      alice.post(`/api/shares/${dto.id}/regenerate`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.share.count({ where: { revokedAt: null } })).toBe(1);
    expect(await prisma.share.count()).toBe(2);
  });
});

describe('authentication', () => {
  it('requires login and a CSRF token', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    const { default: request } = await import('supertest');

    expect((await request(app).get('/api/shares')).status).toBe(401);
    // No CSRF header: rejected before any route runs.
    const noCsrf = await request(app).post(`/api/files/${file.id}/share`).send({});
    expect(noCsrf.status).toBe(403);
    expect(await prisma.share.count()).toBe(0);
  });
});
