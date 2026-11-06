import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { getCookie } from './helpers/cookies.js';
import { resetDb } from './helpers/db.js';
import { api, createAgent } from './helpers/http.js';

const app = createApp();
const http = api(app);

const alice = { name: 'Alice', email: 'alice@example.com', password: 'correct-horse-battery' };

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
});
afterAll(() => prisma.$disconnect());

/** Registers Alice and returns the response (cookies included). */
function registerAlice(overrides = {}) {
  return http.post('/api/auth/register').send({ ...alice, ...overrides });
}

describe('POST /api/auth/register', () => {
  it('creates the user, returns a safe DTO and sets HttpOnly auth cookies', async () => {
    const res = await registerAlice({ email: '  Alice@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Alice',
      email: 'alice@example.com', // trimmed + lower-cased
      role: 'USER',
      storageUsed: 0,
      storageLimit: 5 * 1024 ** 3,
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // no bcrypt hash anywhere

    const access = getCookie(res, 'cd_access');
    const refresh = getCookie(res, 'cd_refresh');
    expect(access.raw).toMatch(/HttpOnly/);
    expect(access.raw).toMatch(/Path=\/api/);
    expect(refresh.raw).toMatch(/HttpOnly/);
    expect(refresh.raw).toMatch(/Path=\/api\/auth/);
    expect(refresh.raw).toMatch(/SameSite=Strict/);
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await registerAlice();
    const user = await prisma.user.findUnique({ where: { email: alice.email } });

    expect(user.passwordHash).toMatch(/^\$2b\$/);
    expect(user.passwordHash).not.toContain(alice.password);
  });

  it('stores only a hash of the refresh token', async () => {
    const res = await registerAlice();
    const refresh = getCookie(res, 'cd_refresh').value;
    const session = await prisma.session.findFirst();

    expect(session.refreshTokenHash).toHaveLength(64);
    expect(session.refreshTokenHash).not.toBe(refresh);
  });

  it('rejects a duplicate email, ignoring case (409)', async () => {
    await registerAlice();
    const res = await registerAlice({ email: 'ALICE@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns field-level validation errors (400)', async () => {
    const res = await http
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('rejects passwords longer than 72 bytes (bcrypt limit)', async () => {
    const res = await registerAlice({ password: '😀'.repeat(19) }); // 19 × 4 bytes = 76

    expect(res.status).toBe(400);
  });

  it('rejects unknown fields such as role (mass assignment)', async () => {
    const res = await registerAlice({ role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => registerAlice());

  it('logs in with correct credentials and sets cookies', async () => {
    const res = await http
      .post('/api/auth/login')
      .send({ email: 'ALICE@example.com', password: alice.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(alice.email);
    expect(getCookie(res, 'cd_access')).toBeDefined();
    expect(getCookie(res, 'cd_refresh')).toBeDefined();
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await http
      .post('/api/auth/login')
      .send({ email: alice.email, password: 'wrong-password' });
    const unknownEmail = await http
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error).toEqual(wrongPassword.body.error);
  });

  it('blocks suspended users (403)', async () => {
    await prisma.user.update({ where: { email: alice.email }, data: { status: 'SUSPENDED' } });

    const res = await http
      .post('/api/auth/login')
      .send({ email: alice.email, password: alice.password });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a cookie', async () => {
    const res = await http.get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid cookie', async () => {
    const browser = await createAgent(app); // keeps cookies between requests
    await browser.post('/api/auth/register').send(alice);

    const res = await browser.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(alice.email);
  });

  it('rejects a token signed with a different secret', async () => {
    const res1 = await registerAlice();
    const { sid, sub } = jwt.decode(getCookie(res1, 'cd_access').value);
    const forged = jwt.sign({ sid }, 'attacker-secret-attacker-secret-attacker', {
      subject: sub,
      issuer: 'clouddrive',
      audience: 'clouddrive-api',
    });

    const res = await http.get('/api/auth/me', { cookies: [`cd_access=${forged}`] });

    expect(res.status).toBe(401);
  });

  it('returns TOKEN_EXPIRED for an expired access token', async () => {
    const res1 = await registerAlice();
    const { sid, sub } = jwt.decode(getCookie(res1, 'cd_access').value);
    const expired = jwt.sign(
      { sid, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET,
      { subject: sub, issuer: 'clouddrive', audience: 'clouddrive-api' },
    );

    const res = await http.get('/api/auth/me', { cookies: [`cd_access=${expired}`] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('blocks a suspended user immediately, even with a valid token', async () => {
    const browser = await createAgent(app);
    await browser.post('/api/auth/register').send(alice);
    await prisma.user.update({ where: { email: alice.email }, data: { status: 'SUSPENDED' } });

    const res = await browser.get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues new tokens and invalidates the old refresh token (rotation)', async () => {
    const registered = await registerAlice();
    const oldRefresh = getCookie(registered, 'cd_refresh').value;

    const res = await http
      .post('/api/auth/refresh', { cookies: [`cd_refresh=${oldRefresh}`] })
      .send();

    expect(res.status).toBe(200);
    const newRefresh = getCookie(res, 'cd_refresh').value;
    expect(newRefresh).not.toBe(oldRefresh);
    expect(getCookie(res, 'cd_access')).toBeDefined();

    // The old token must no longer work.
    const replay = await http
      .post('/api/auth/refresh', { cookies: [`cd_refresh=${oldRefresh}`] })
      .send();
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 401 and clears cookies without a refresh token', async () => {
    const res = await http.post('/api/auth/refresh').send();

    expect(res.status).toBe(401);
    expect(getCookie(res, 'cd_access').raw).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session: the old access token stops working immediately', async () => {
    const registered = await registerAlice();
    const access = getCookie(registered, 'cd_access').value;
    const refresh = getCookie(registered, 'cd_refresh').value;

    const res = await http
      .post('/api/auth/logout', { cookies: [`cd_access=${access}`, `cd_refresh=${refresh}`] })
      .send();
    expect(res.status).toBe(204);

    // The JWT itself is still within its 15 minutes, but its session is revoked.
    const me = await http.get('/api/auth/me', { cookies: [`cd_access=${access}`] });
    expect(me.status).toBe(401);

    const refreshAgain = await http
      .post('/api/auth/refresh', { cookies: [`cd_refresh=${refresh}`] })
      .send();
    expect(refreshAgain.status).toBe(401);
  });

  it('succeeds even when not logged in (idempotent)', async () => {
    const res = await http.post('/api/auth/logout').send();

    expect(res.status).toBe(204);
  });
});
