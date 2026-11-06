import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { api } from './helpers/http.js';

const app = createApp();

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/health (liveness)', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('tells browsers and proxies never to store API responses', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sends no ETag, so browsers can never get a 304 "use your cached copy"', async () => {
    const res = await request(app).get('/api/health/ready');

    expect(res.headers.etag).toBeUndefined();
  });
});

describe('request IDs', () => {
  it('generates a request ID when none is sent', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a safe incoming request ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc-123');

    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('replaces an unsafe incoming request ID', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', '<script>alert(1)</script>');

    expect(res.headers['x-request-id']).not.toContain('<');
  });
});

describe('GET /api/health/ready (readiness)', () => {
  it('returns 200 when the database is reachable', async () => {
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.data.checks.database.status).toBe('ok');
  });

  it('returns 503 without leaking error details when the database is down', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connect ECONNREFUSED secret'));

    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.details.checks.database).toEqual({ status: 'error' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});

describe('error handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND' },
    });
    expect(res.body.requestId).toBeDefined();
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const res = await api(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 for oversized JSON bodies', async () => {
    const res = await api(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
