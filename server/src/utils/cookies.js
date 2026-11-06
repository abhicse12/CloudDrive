import { env } from '../config/env.js';

export const AUTH_COOKIES = {
  access: 'cd_access',
  refresh: 'cd_refresh',
};

const base = {
  httpOnly: true, // JavaScript in the page can't read it, so XSS can't steal it
  secure: env.COOKIE_SECURE, // HTTPS only (in production)
};

// Access cookie: sent with every /api request.
// SameSite=Lax: not sent on requests started by other websites (except top-level links).
const accessOptions = { ...base, sameSite: 'lax', path: '/api' };

// Refresh cookie: sent ONLY to /api/auth/* (refresh, logout), so the long-lived token
// travels as rarely as possible. SameSite=Strict: never sent from other websites.
const refreshOptions = { ...base, sameSite: 'strict', path: '/api/auth' };

export function setAuthCookies(res, { accessToken, refreshToken, refreshExpiresAt }) {
  res.cookie(AUTH_COOKIES.access, accessToken, {
    ...accessOptions,
    maxAge: env.JWT_ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(AUTH_COOKIES.refresh, refreshToken, { ...refreshOptions, expires: refreshExpiresAt });
}

export function clearAuthCookies(res) {
  // Options must match the ones used when setting, or the browser keeps the cookie.
  res.clearCookie(AUTH_COOKIES.access, accessOptions);
  res.clearCookie(AUTH_COOKIES.refresh, refreshOptions);
}
