import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { shareRepository } from '../src/repositories/share.repository.js';
import { generateOpaqueToken } from '../src/services/token.service.js';
import { redactUrl } from '../src/utils/redactUrl.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { api } from './helpers/http.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();

let alice;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

// A visitor: no cookies, no login.
const visitor = () => api(app);
const describeShare = (token) => visitor().get(`/api/public/shares/${token}`);
const download = (token, query = '') =>
  visitor().get(`/api/public/shares/${token}/download${query}`);

/** Uploads a file, shares it, returns { file, share, token }. */
async function sharedFile(content = SAMPLES.pdf, name = 'plan.pdf', body = {}, folderId) {
  const file = await uploadOne(alice, content, name, folderId ? { folderId } : undefined);
  const res = await alice.post(`/api/files/${file.id}/share`).send(body);
  return { file, share: res.body.data.share, token: res.body.data.url.split('/s/')[1] };
}

const shareRow = (id) => prisma.share.findUnique({ where: { id } });

/** Every failed lookup must look exactly like every other one. */
const errorBody = (res) => ({ status: res.status, error: res.body.error });

describe('GET /api/public/shares/:token', () => {
  it('describes the file without login, and nothing more', async () => {
    const { token, share } = await sharedFile(SAMPLES.pdf, 'plan.pdf', { expiresIn: '1d' });

    const res = await describeShare(token);

    expect(res.status).toBe(200);
    expect(res.body.data.share).toEqual({
      fileName: 'plan.pdf',
      size: SAMPLES.pdf.length,
      mimeType: 'application/pdf',
      category: 'DOCUMENT',
      expiresAt: share.expiresAt,
      canPreview: true,
    });
  });

  it('does not count as an access', async () => {
    const { token, share } = await sharedFile();
    await describeShare(token);
    expect((await shareRow(share.id)).accessCount).toBe(0);
  });

  it('sends privacy headers: no referrer, no indexing, no caching', async () => {
    const { token } = await sharedFile();

    for (const res of [await describeShare(token), await describeShare('bogus')]) {
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('every broken link gets the same 404', () => {
  it('unknown, malformed, revoked, expired, trashed, suspended, deleted', async () => {
    const reference = errorBody(await describeShare(generateOpaqueToken()));
    expect(reference.status).toBe(404);

    const revoked = await sharedFile();
    await alice.delete(`/api/shares/${revoked.share.id}`);

    const expired = await sharedFile();
    await prisma.share.update({
      where: { id: expired.share.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const trashed = await sharedFile();
    await alice.delete(`/api/files/${trashed.file.id}`);

    const folder = (await alice.post('/api/folders').send({ name: 'Docs' })).body.data.folder;
    const inTrashedFolder = await sharedFile(SAMPLES.pdf, 'in-folder.pdf', {}, folder.id);
    await alice.delete(`/api/folders/${folder.id}`);

    const deleted = await sharedFile();
    await alice.delete(`/api/files/${deleted.file.id}`);
    await alice.delete(`/api/files/${deleted.file.id}/permanent`);

    const cases = {
      malformed: 'not-a-token',
      tooLong: 'a'.repeat(100),
      revoked: revoked.token,
      expired: expired.token,
      trashed: trashed.token,
      inTrashedFolder: inTrashedFolder.token,
      deleted: deleted.token,
    };
    for (const [name, token] of Object.entries(cases)) {
      expect({ name, ...errorBody(await describeShare(token)) }).toEqual({ name, ...reference });
      expect({ name, ...errorBody(await download(token)) }).toEqual({ name, ...reference });
    }
  });

  it('stops working while the owner is suspended, and resumes after', async () => {
    const { token } = await sharedFile();
    const setStatus = (status) =>
      prisma.user.update({ where: { id: alice.user.id }, data: { status } });

    await setStatus('SUSPENDED');
    expect((await describeShare(token)).status).toBe(404);
    expect((await download(token)).status).toBe(404);

    await setStatus('ACTIVE');
    expect((await describeShare(token)).status).toBe(200);
  });

  it('works again when the trashed file is restored (the link was paused, not revoked)', async () => {
    const { file, token } = await sharedFile();

    await alice.delete(`/api/files/${file.id}`);
    expect((await describeShare(token)).status).toBe(404);

    await alice.post(`/api/files/${file.id}/restore`);
    expect((await describeShare(token)).status).toBe(200);
  });
});

describe('GET /api/public/shares/:token/download', () => {
  it('redirects to a signed URL that serves the bytes as an attachment, and counts it', async () => {
    const { token, share } = await sharedFile(SAMPLES.pdf, 'Q3 report.pdf');

    const res = await download(token);

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/api\/storage\//);
    expect(res.headers['referrer-policy']).toBe('no-referrer');

    const bytes = await visitor().get(res.headers.location).buffer(true);
    expect(bytes.status).toBe(200);
    expect(Buffer.compare(bytes.body, SAMPLES.pdf)).toBe(0);
    expect(bytes.headers['content-disposition']).toMatch(/^attachment; filename="Q3 report.pdf"/);

    const row = await shareRow(share.id);
    expect(row.accessCount).toBe(1);
    expect(row.lastAccessedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('opens safe types inline, but never unsafe ones', async () => {
    const image = await sharedFile(SAMPLES.png, 'a.png');
    const office = await sharedFile(SAMPLES.cfb, 'old.doc');

    const inline = await visitor().get(
      (await download(image.token, '?disposition=inline')).headers.location,
    );
    expect(inline.headers['content-disposition']).toMatch(/^inline/);

    const forced = await visitor().get(
      (await download(office.token, '?disposition=inline')).headers.location,
    );
    expect(forced.headers['content-disposition']).toMatch(/^attachment/);
    expect((await describeShare(office.token)).body.data.share.canPreview).toBe(false);
  });

  it('rejects unknown query parameters', async () => {
    const { token } = await sharedFile();
    expect((await download(token, '?disposition=evil')).status).toBe(400);
    expect((await download(token, '?redirect=false')).status).toBe(400);
  });

  it('counts parallel downloads exactly (atomic increment)', async () => {
    const { token, share } = await sharedFile();
    const PARALLEL = 5;

    // Force the overlap: every request finishes its lookup (reading accessCount = 0)
    // before any of them records the access. A read-then-write counter would end at 1.
    const realFindPublic = shareRepository.findPublic.bind(shareRepository);
    let arrived = 0;
    let release;
    const allArrived = new Promise((resolve) => (release = resolve));
    vi.spyOn(shareRepository, 'findPublic').mockImplementation(async (...args) => {
      const result = await realFindPublic(...args);
      arrived += 1;
      if (arrived === PARALLEL) release();
      await allArrived;
      return result;
    });

    const results = await Promise.all(Array.from({ length: PARALLEL }, () => download(token)));

    expect(results.every((r) => r.status === 302)).toBe(true);
    expect((await shareRow(share.id)).accessCount).toBe(PARALLEL);
  });
});

describe('rate limits (per IP)', () => {
  it('allows 30 downloads a minute', async () => {
    const { token } = await sharedFile();
    for (let i = 0; i < 30; i += 1) expect((await download(token)).status).toBe(302);

    const blocked = await download(token);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('allows 60 page loads a minute, counting failed lookups too', async () => {
    for (let i = 0; i < 60; i += 1) expect((await describeShare('bogus')).status).toBe(404);
    expect((await describeShare('bogus')).status).toBe(429);
  });
});

describe('redactUrl (tokens never reach the logs)', () => {
  it('hides share and signed storage tokens, keeping the rest of the URL', () => {
    const token = generateOpaqueToken();
    expect(redactUrl(`/api/public/shares/${token}`)).toBe('/api/public/shares/[REDACTED]');
    expect(redactUrl(`/api/public/shares/${token}/download?disposition=inline`)).toBe(
      '/api/public/shares/[REDACTED]/download?disposition=inline',
    );
    expect(redactUrl('/api/storage/abc.def?x=1')).toBe('/api/storage/[REDACTED]?x=1');
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/files?q=report')).toBe('/api/files?q=report');
    expect(redactUrl('/api/shares/123')).toBe('/api/shares/123');
    expect(redactUrl(undefined)).toBe('');
  });
});
