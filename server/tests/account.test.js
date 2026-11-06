import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { emailProvider } from '../src/email/index.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { resetDb } from './helpers/db.js';
import { api, createAgent } from './helpers/http.js';

const app = createApp();
const http = api(app);

const carol = { name: 'Carol', email: 'carol@example.com', password: 'carol-old-password' };
const carolLogin = { email: carol.email, password: carol.password };

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

/** A logged-in browser session for Carol. */
async function loggedInCarol() {
  const browser = await createAgent(app);
  await browser.post('/api/auth/register').send(carol);
  return browser;
}

describe('PATCH /api/auth/me', () => {
  it('updates the name', async () => {
    const browser = await loggedInCarol();

    const res = await browser.patch('/api/auth/me').send({ name: '  Carol Smith ' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Carol Smith');
  });

  it('cannot change email, role or quota through the profile endpoint', async () => {
    const browser = await loggedInCarol();

    const res = await browser
      .patch('/api/auth/me')
      .send({ name: 'Carol', role: 'ADMIN', storageLimit: 999999999999 });

    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { email: carol.email } });
    expect(user.role).toBe('USER');
  });

  it('requires login', async () => {
    const res = await http.patch('/api/auth/me').send({ name: 'X' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password and logs out OTHER devices, but not this one', async () => {
    const laptop = await loggedInCarol();
    const phone = await createAgent(app);
    await phone.post('/api/auth/login').send(carolLogin);

    const res = await laptop
      .post('/api/auth/change-password')
      .send({ currentPassword: carol.password, newPassword: 'carol-new-password' });

    expect(res.status).toBe(204);
    expect((await laptop.get('/api/auth/me')).status).toBe(200); // still logged in
    expect((await phone.get('/api/auth/me')).status).toBe(401); // kicked out

    const oldLogin = await http.post('/api/auth/login').send(carolLogin);
    expect(oldLogin.status).toBe(401);
    const newLogin = await http
      .post('/api/auth/login')
      .send({ email: carol.email, password: 'carol-new-password' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects a wrong current password with 400 (not 401)', async () => {
    const browser = await loggedInCarol();

    const res = await browser
      .post('/api/auth/change-password')
      .send({ currentPassword: 'not-my-password', newPassword: 'carol-new-password' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects reusing the same password', async () => {
    const browser = await loggedInCarol();

    const res = await browser
      .post('/api/auth/change-password')
      .send({ currentPassword: carol.password, newPassword: carol.password });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('newPassword');
  });

  it('records the change in the activity log', async () => {
    const browser = await loggedInCarol();
    await browser
      .post('/api/auth/change-password')
      .send({ currentPassword: carol.password, newPassword: 'carol-new-password' });

    const log = await prisma.activityLog.findFirst();
    expect(log).toMatchObject({ action: 'PASSWORD_CHANGED', targetType: 'ACCOUNT' });
  });
});

describe('password reset', () => {
  /** Requests a reset email and returns the token from the link inside it. */
  async function requestResetToken(email = carol.email) {
    const send = vi.spyOn(emailProvider, 'send').mockResolvedValue();
    const res = await http.post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(send).toHaveBeenCalled()); // email is sent in the background
    const link = send.mock.calls.at(-1)[0].text.match(/https?:\/\/\S+/)[0];
    return { token: new URL(link).searchParams.get('token'), link, email: send.mock.calls[0][0] };
  }

  beforeEach(() => http.post('/api/auth/register').send(carol));

  it('emails a link to the frontend reset page and stores only the token hash', async () => {
    const { token, link, email } = await requestResetToken();

    expect(email.to).toBe(carol.email);
    expect(link.startsWith('http://localhost:5173/reset-password?token=')).toBe(true);
    const stored = await prisma.passwordResetToken.findFirst();
    expect(stored.tokenHash).not.toBe(token);
  });

  it('responds identically for unknown emails, and sends nothing', async () => {
    const send = vi.spyOn(emailProvider, 'send').mockResolvedValue();

    const known = await http.post('/api/auth/forgot-password').send({ email: carol.email });
    const unknown = await http.post('/api/auth/forgot-password').send({ email: 'ghost@x.com' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1)); // only for Carol
  });

  it('resets the password and logs out every device', async () => {
    const browser = await createAgent(app);
    await browser.post('/api/auth/login').send(carolLogin);
    const { token } = await requestResetToken();

    const res = await http
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'carol-reset-password' });

    expect(res.status).toBe(204);
    expect((await browser.get('/api/auth/me')).status).toBe(401);
    const login = await http
      .post('/api/auth/login')
      .send({ email: carol.email, password: 'carol-reset-password' });
    expect(login.status).toBe(200);
  });

  it('works only once', async () => {
    const { token } = await requestResetToken();
    await http.post('/api/auth/reset-password').send({ token, newPassword: 'first-new-password' });

    const again = await http
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'second-new-password' });

    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects expired links', async () => {
    const { token } = await requestResetToken();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });

    const res = await http
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'carol-new-password' });

    expect(res.status).toBe(400);
  });

  it('invalidates the older link when a new one is requested', async () => {
    const first = await requestResetToken();
    vi.restoreAllMocks();
    const second = await requestResetToken();

    const withOld = await http
      .post('/api/auth/reset-password')
      .send({ token: first.token, newPassword: 'carol-new-password' });
    const withNew = await http
      .post('/api/auth/reset-password')
      .send({ token: second.token, newPassword: 'carol-new-password' });

    expect(withOld.status).toBe(400);
    expect(withNew.status).toBe(204);
  });

  it('rejects malformed tokens without touching the database', async () => {
    const res = await http
      .post('/api/auth/reset-password')
      .send({ token: "' OR 1=1 --", newPassword: 'carol-new-password' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
