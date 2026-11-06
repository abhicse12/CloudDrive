import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { generateOpaqueToken } from '../services/token.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * CSRF (Cross-Site Request Forgery) protection, "double-submit cookie" pattern.
 *
 * The attack: you're logged in to CloudDrive, then visit evil.com. evil.com submits a
 * hidden form to our API; your browser attaches your cookies automatically, so the
 * request looks like it came from you.
 *
 * The defence: the server sets a random token in a cookie that JavaScript CAN read.
 * Our frontend copies it into the X-CSRF-Token header on every state-changing request.
 * evil.com can make your browser SEND our cookies, but it can't READ them (same-origin
 * policy), so it can't put the right value in the header.
 *
 * Extra layers: SameSite cookies and an Origin check. In production the cookie gets the
 * __Host- prefix, which browsers only accept over HTTPS, on path "/", and without a
 * Domain, so a compromised subdomain can't plant a fake token for us.
 */
export const CSRF_COOKIE = env.COOKIE_SECURE ? '__Host-cd_csrf' : 'cd_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_FORMAT = /^[\w-]{43}$/; // 32 random bytes in base64url

function tokensMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Constant-time comparison: doesn't leak how many leading characters were right.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Middleware: rejects state-changing requests without a valid CSRF token. */
export function csrfProtection(req, _res, next) {
  // Reading data can't change anything, so GET/HEAD/OPTIONS are exempt.
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    throw new AppError(403, 'CSRF_ORIGIN_MISMATCH', 'Request origin is not allowed.');
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    throw new AppError(
      403,
      'CSRF_INVALID',
      'Missing or invalid security token. Refresh the page and try again.',
    );
  }

  next();
}

/** GET /api/auth/csrf: gives the frontend a token (reusing the current one if valid). */
export function issueCsrfToken(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = existing && TOKEN_FORMAT.test(existing) ? existing : generateOpaqueToken();

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // the frontend must read it to copy it into the header
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ success: true, data: { csrfToken: token } });
}
