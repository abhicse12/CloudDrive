import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { storage } from '../src/storage/index.js';
import { contentDisposition } from '../src/utils/contentDisposition.js';

const app = createApp();

beforeEach(async () => {
  await fs.rm(env.STORAGE_LOCAL_ROOT, { recursive: true, force: true });
  await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
});
afterAll(() => prisma.$disconnect());

/** Writes a temp file (like Multer would) and stores it under a fresh key. */
async function storeFile(content, key = `users/${randomUUID()}/${randomUUID()}`) {
  const tmp = path.join(env.UPLOAD_TMP_DIR, randomUUID());
  await fs.writeFile(tmp, content);
  await storage.upload({ key, sourcePath: tmp, contentType: 'application/octet-stream' });
  return { key, tmp };
}

const signedUrl = (key, options = {}) =>
  storage.getSignedUrl(key, {
    expiresIn: 60,
    disposition: 'inline',
    filename: 'file.txt',
    contentType: 'text/plain',
    ...options,
  });

describe('LocalStorageProvider', () => {
  it('moves the temp file into storage and can read it back', async () => {
    const { key, tmp } = await storeFile('hello');

    await expect(fs.access(tmp)).rejects.toThrow(); // temp file is gone (moved)
    expect(await storage.getMetadata(key)).toMatchObject({ size: 5 });
    const chunks = [];
    for await (const chunk of await storage.download(key)) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('delete is idempotent and getMetadata returns null for missing files', async () => {
    const { key } = await storeFile('x');

    await storage.delete(key);
    await storage.delete(key); // second time: no error

    expect(await storage.getMetadata(key)).toBeNull();
  });

  it.each([
    '../outside',
    'users/../../server/.env',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'users//double',
    'users/a.b', // dots are never part of our keys
    '',
  ])('refuses the unsafe key %j (path traversal)', (key) => {
    expect(() => storage.pathFor(key)).toThrow();
  });
});

describe('GET /api/storage/:token (signed URLs)', () => {
  it('serves the file inline with safe headers', async () => {
    const { key } = await storeFile('hello world');

    const res = await request(app).get(await signedUrl(key));

    expect(res.status).toBe(200);
    expect(res.text).toBe('hello world');
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="file.txt"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('forces download for HTML even if the link asks for inline (no stored XSS)', async () => {
    const { key } = await storeFile('<script>alert(1)</script>');

    const res = await request(app).get(
      await signedUrl(key, { contentType: 'text/html', filename: 'page.html' }),
    );

    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('supports Range requests, so videos can seek (206 Partial Content)', async () => {
    const { key } = await storeFile('0123456789');

    const res = await request(app)
      .get(await signedUrl(key))
      .set('Range', 'bytes=2-5');

    expect(res.status).toBe(206);
    expect(res.text).toBe('2345');
    expect(res.headers['content-range']).toBe('bytes 2-5/10');
  });

  it('rejects a tampered link: changing the file key breaks the signature', async () => {
    const { key } = await storeFile('mine');
    const { key: otherKey } = await storeFile('someone else');
    const url = await signedUrl(key);

    // Re-encode the payload with another key, keep the original signature.
    const [body, signature] = url.split('/').pop().split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, k: otherKey })).toString(
      'base64url',
    );

    const res = await request(app).get(`/api/storage/${forgedBody}.${signature}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_SIGNED_URL');
  });

  it('rejects an expired link', async () => {
    const { key } = await storeFile('soon gone');
    const url = await signedUrl(key, { expiresIn: 30 });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
    try {
      const res = await request(app).get(url);
      expect(res.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['garbage', 'a.b.c', 'a.', '.b'])('rejects a malformed token %j', async (token) => {
    const res = await request(app).get(`/api/storage/${token}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 when the file was deleted after the link was issued', async () => {
    const { key } = await storeFile('x');
    const url = await signedUrl(key);
    await storage.delete(key);

    const res = await request(app).get(url);

    expect(res.status).toBe(404);
  });
});

describe('contentDisposition', () => {
  it('keeps the exact Unicode name and a safe ASCII fallback', () => {
    expect(contentDisposition('attachment', 'रिपोर्ट "final".pdf')).toBe(
      `attachment; filename="_______ _final_.pdf"; filename*=UTF-8''${encodeURIComponent('रिपोर्ट "final".pdf')}`,
    );
  });

  it('cannot be used to inject extra headers', () => {
    expect(contentDisposition('inline', 'a\r\nSet-Cookie: x=1')).not.toMatch(/[\r\n]/);
  });
});

describe('readiness', () => {
  it('reports the storage check', async () => {
    const res = await request(app).get('/api/health/ready');

    expect(res.body.data.checks.storage).toEqual({ status: 'ok' });
  });
});
