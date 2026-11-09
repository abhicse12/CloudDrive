import { HOUR, MINUTE, MemoryStore, ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/**
 * Rate limits slow down brute-force attacks (guessing passwords, mass sign-ups).
 *
 * Counters live in memory, which is fine for ONE server. With several servers behind a
 * load balancer (AWS Auto Scaling), each would count separately, so in production the
 * store moves to a shared one such as Redis (ElastiCache). Only `store` changes.
 */
const stores = [];

function createLimiter({ windowMs, limit, message, keyGenerator, skipSuccessfulRequests }) {
  const store = new MemoryStore();
  stores.push(store);

  return rateLimit({
    windowMs,
    limit,
    store,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8', // RateLimit + RateLimit-Policy headers tell clients their budget
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

// IPv6 users often control a whole block of addresses; ipKeyGenerator groups them,
// so one attacker can't get a fresh limit per address.
const clientIp = (req) => ipKeyGenerator(req.ip);

/** Any login attempts from one IP: stops one machine from trying many accounts. */
export const loginIpLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 50,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: clientIp,
});

/**
 * FAILED logins for one account from one IP: stops password guessing on an account.
 * Successful logins don't count, so normal users are never locked out by this.
 * Keyed by IP + email (not email alone), so an attacker can't lock a victim out of
 * their own account just by typing wrong passwords for it.
 */
export const loginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many failed login attempts for this account. Please try again in 15 minutes.',
  keyGenerator: (req) =>
    `${clientIp(req)}:${String(req.body?.email ?? '')
      .trim()
      .toLowerCase()}`,
});

export const registerLimiter = createLimiter({
  windowMs: HOUR,
  limit: 5,
  message: 'Too many accounts created from this network. Please try again later.',
  keyGenerator: clientIp,
});

export const refreshLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: 'Too many session refresh requests. Please try again shortly.',
  keyGenerator: clientIp,
});

// Each reset email costs us money (SES) and could be used to spam someone's inbox.
export const forgotPasswordLimiter = createLimiter({
  windowMs: HOUR,
  limit: 5,
  message: 'Too many password reset requests. Please try again later.',
  keyGenerator: clientIp,
});

export const resetPasswordLimiter = createLimiter({
  windowMs: HOUR,
  limit: 10,
  message: 'Too many password reset attempts. Please try again later.',
  keyGenerator: clientIp,
});

// Keyed by user (requireAuth runs first): stops guessing the current password
// from a hijacked, logged-in browser.
export const changePasswordLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Too many password change attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => `user:${req.auth.userId}`,
});

// Per user. Generous, because the frontend sends one request per file (for per-file
// progress and cancel), but it stops a script from filling the disk with requests.
export const uploadLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: 'Too many uploads. Please wait a few minutes and try again.',
  keyGenerator: (req) => `user:${req.auth.userId}`,
});

/** Tests only: clear all counters so each test starts fresh. */
export async function resetRateLimits() {
  await Promise.all(stores.map((store) => store.resetAll()));
}
