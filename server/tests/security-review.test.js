/**
 * Phase 7 security review, written down as tests so it stays true: response headers,
 * what error responses may contain, CORS, cookie scope, production-only config rules,
 * and the rate limit on creating share links.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env, parseEnv } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { dashboardService } from '../src/services/dashboard.service.js';
import { resetDb } from './helpers/db.js';
import { getCookie } from './helpers/cookies.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
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

describe('response headers on every API response', () => {
  it.each([
    ['200', () => request(app).get('/api/health')],
    ['401', () => request(app).get('/api/files')],
    ['404', () => request(app).get('/api/no-such-route')],
  ])('%s', async (_label, send) => {
    const res = await send();
    const h = res.headers;

    expect(h['x-powered-by']).toBeUndefined();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['cache-control']).toBe('no-store');
    expect(h['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['content-security-policy']).toMatch(/default-src 'self'/);
    expect(h['content-security-policy']).toMatch(/frame-ancestors 'self'/);
    expect(h['content-security-policy']).toMatch(/object-src 'none'/);
  });
});

describe('error responses never reveal internals', () => {
  it('an unexpected error is a generic 500 with no stack trace outside development', async () => {
    vi.spyOn(dashboardService, 'stats').mockRejectedValue(
      new Error('connect ECONNREFUSED postgres://admin:hunter2@db/prod'),
    );

    const res = await alice.get('/api/dashboard/stats');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again later.',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|ECONNREFUSED|stack|\.js:/);
    expect(res.body.requestId).toEqual(expect.any(String)); // for support / log lookup
  });

  it('bad JSON and unknown routes get short, fixed messages', async () => {
    const bad = await alice
      .patch('/api/auth/me')
      .set('Content-Type', 'application/json')
      .send('{"x":');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toEqual({
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON.',
    });
  });
});

describe('CORS', () => {
  it('only the configured origin may make credentialed requests', async () => {
    const [allowed] = env.CORS_ORIGINS;
    const ok = await request(app).get('/api/health').set('Origin', allowed);
    expect(ok.headers['access-control-allow-origin']).toBe(allowed);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('auth cookies', () => {
  it('are HttpOnly, SameSite, and scoped to the paths that need them', async () => {
    const client = await loginAsNewUser(app);
    const login = await client.post('/api/auth/login').send({
      email: client.user.email,
      password: 'test-password-123',
    });
    const access = getCookie(login, 'cd_access');
    const refresh = getCookie(login, 'cd_refresh');

    expect(access.raw).toMatch(/HttpOnly/);
    expect(access.raw).toMatch(/SameSite=Lax/);
    expect(access.raw).toMatch(/Path=\/api(;|$)/);
    expect(refresh.raw).toMatch(/HttpOnly/);
    expect(refresh.raw).toMatch(/SameSite=Strict/);
    // The long-lived token only ever travels to /api/auth/* (refresh, logout).
    expect(refresh.raw).toMatch(/Path=\/api\/auth(;|$)/);
  });
});

describe('production configuration rules', () => {
  // A complete, valid production config, except for what each test changes.
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db:5432/clouddrive',
    JWT_ACCESS_SECRET: 'j'.repeat(40),
    STORAGE_SIGNING_SECRET: 's'.repeat(40),
    COOKIE_SECURE: 'true',
    BCRYPT_ROUNDS: '12',
    EMAIL_PROVIDER: 'console',
  };

  it('refuses insecure cookies and weak password hashing', () => {
    expect(() => parseEnv({ ...production, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => parseEnv({ ...production, BCRYPT_ROUNDS: '10' })).toThrow(/BCRYPT_ROUNDS/);
  });

  it('refuses the console email provider, which would write reset links (tokens) to the logs', () => {
    expect(() => parseEnv(production)).toThrow(/EMAIL_PROVIDER/);
  });

  it('allows the console provider (and plain cookies) outside production', () => {
    const dev = { ...production, NODE_ENV: 'development', COOKIE_SECURE: 'false' };
    expect(parseEnv(dev).EMAIL_PROVIDER).toBe('console');
  });
});

describe('creating share links is rate limited per user', () => {
  it('allows 100 links an hour, then 429', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');
    for (let i = 0; i < 100; i += 1) {
      expect((await alice.post(`/api/files/${file.id}/share`).send({})).status).toBe(201);
    }

    const blocked = await alice.post(`/api/files/${file.id}/share`).send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    // Per user: someone else is not affected.
    const bob = await loginAsNewUser(app, { name: 'Bob' });
    const own = await uploadOne(bob, SAMPLES.png, 'b.png');
    expect((await bob.post(`/api/files/${own.id}/share`).send({})).status).toBe(201);
  });
});
