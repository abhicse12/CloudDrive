import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { requireRole } from '../src/middleware/requireRole.js';
import { getCookie } from './helpers/cookies.js';
import { resetDb } from './helpers/db.js';
import { api, createAgent } from './helpers/http.js';

const app = createApp();
const http = api(app);

const bob = { name: 'Bob', email: 'bob@example.com', password: 'bob-secret-password' };
const bobLogin = { email: bob.email, password: bob.password };

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
});
afterAll(() => prisma.$disconnect());

describe('CSRF protection', () => {
  it('GET /api/auth/csrf issues a readable (non-HttpOnly) SameSite cookie', async () => {
    const res = await request(app).get('/api/auth/csrf');

    const cookie = getCookie(res, 'cd_csrf');
    expect(res.body.data.csrfToken).toBe(cookie.value);
    expect(cookie.raw).not.toMatch(/HttpOnly/);
    expect(cookie.raw).toMatch(/SameSite=Lax/);
  });

  it('rejects a POST without any CSRF token (403)', async () => {
    const res = await request(app).post('/api/auth/register').send(bob);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
    expect(await prisma.user.count()).toBe(0); // nothing happened
  });

  it('rejects a header that does not match the cookie (403)', async () => {
    const browser = await createAgent(app);

    const res = await browser
      .post('/api/auth/register')
      .set('X-CSRF-Token', 'forged-value-forged-value-forged-value-123')
      .send(bob);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects requests from an origin that is not allowed (403)', async () => {
    const browser = await createAgent(app);

    const res = await browser
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example')
      .send(bob);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('accepts a matching token from the allowed origin', async () => {
    const browser = await createAgent(app);

    const res = await browser
      .post('/api/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send(bob);

    expect(res.status).toBe(201);
  });

  it('reuses the existing CSRF token instead of rotating it on every call', async () => {
    const browser = await createAgent(app);
    const again = await browser.get('/api/auth/csrf');

    expect(again.body.data.csrfToken).toBe(browser.csrfToken);
  });
});

describe('rate limiting', () => {
  beforeEach(() => http.post('/api/auth/register').send(bob));

  it('blocks an account after 10 failed logins, even with the right password', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await http
        .post('/api/auth/login')
        .send({ email: bob.email, password: `wrong-${i}` });
      expect(res.status).toBe(401);
    }

    const blocked = await http.post('/api/auth/login').send(bobLogin);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers.ratelimit).toBeDefined(); // tells clients when to retry
  });

  it('does not count successful logins', async () => {
    for (let i = 0; i < 12; i++) {
      const res = await http.post('/api/auth/login').send(bobLogin);
      expect(res.status).toBe(200);
    }
  });

  it('limits failed attempts per account, not for everyone', async () => {
    for (let i = 0; i < 11; i++) {
      await http.post('/api/auth/login').send({ email: bob.email, password: 'wrong' });
    }

    const otherAccount = await http
      .post('/api/auth/login')
      .send({ email: 'someone-else@example.com', password: 'wrong' });

    expect(otherAccount.status).toBe(401); // normal failure, not 429
  });

  it('allows at most 5 registrations per hour from one IP', async () => {
    // beforeEach already registered Bob (1 of 5).
    for (let i = 2; i <= 5; i++) {
      const res = await http
        .post('/api/auth/register')
        .send({ ...bob, email: `user${i}@example.com` });
      expect(res.status).toBe(201);
    }

    const sixth = await http
      .post('/api/auth/register')
      .send({ ...bob, email: 'user6@example.com' });

    expect(sixth.status).toBe(429);
  });
});

describe('refresh token reuse detection', () => {
  /** Registers Bob and rotates once: returns the old (used) and the new refresh token. */
  async function registerAndRotate() {
    const registered = await http.post('/api/auth/register').send(bob);
    const oldToken = getCookie(registered, 'cd_refresh').value;
    const rotated = await http.post('/api/auth/refresh', { cookies: [`cd_refresh=${oldToken}`] });
    return { oldToken, newToken: getCookie(rotated, 'cd_refresh').value };
  }

  const refreshWith = (token) =>
    http.post('/api/auth/refresh', { cookies: [`cd_refresh=${token}`] });

  it('revokes the whole session when an old token is replayed later', async () => {
    const { oldToken, newToken } = await registerAndRotate();
    // Pretend the rotation happened a minute ago (outside the grace period).
    await prisma.session.updateMany({ data: { rotatedAt: new Date(Date.now() - 60_000) } });

    const replay = await refreshWith(oldToken);
    expect(replay.status).toBe(401);

    // The attacker replayed the old token, so even the legitimate NEW token is now dead.
    const legit = await refreshWith(newToken);
    expect(legit.status).toBe(401);
    const session = await prisma.session.findFirst();
    expect(session.revokedAt).not.toBeNull();
  });

  it('does not revoke on a replay within the grace period (parallel tabs)', async () => {
    const { oldToken, newToken } = await registerAndRotate();

    const replay = await refreshWith(oldToken);
    expect(replay.status).toBe(401);

    const legit = await refreshWith(newToken);
    expect(legit.status).toBe(200);
  });

  it('only one of two simultaneous refreshes with the same token succeeds', async () => {
    const registered = await http.post('/api/auth/register').send(bob);
    const token = getCookie(registered, 'cd_refresh').value;

    const results = await Promise.all([refreshWith(token), refreshWith(token)]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
  });
});

describe('requireRole', () => {
  const run = (middleware, req) => {
    let passed = false;
    middleware(req, {}, () => (passed = true));
    return passed;
  };

  it('lets an ADMIN through an admin-only route', () => {
    expect(run(requireRole('ADMIN'), { auth: { role: 'ADMIN' } })).toBe(true);
  });

  it('returns 403 for a logged-in USER', () => {
    expect(() => run(requireRole('ADMIN'), { auth: { role: 'USER' } })).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('returns 401 when requireAuth did not run', () => {
    expect(() => run(requireRole('ADMIN'), {})).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});
