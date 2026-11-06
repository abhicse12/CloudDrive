import axios from 'axios';

/**
 * The ONE HTTP client for talking to the CloudDrive API. Every request goes through two
 * "interceptors" (checkpoints) so pages never deal with tokens themselves:
 *
 *  1. Request:  state-changing requests (POST/PUT/PATCH/DELETE) get the CSRF header.
 *  2. Response: a 401 triggers ONE silent token refresh, then the request is retried.
 *
 * Auth tokens live in HttpOnly cookies, which JavaScript can't read; the browser
 * attaches them automatically. This file never sees them, and that's the point.
 */
export const apiClient = axios.create({
  baseURL: '/api', // same origin: Vite proxy in dev, CloudFront in production
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// A 401 from these means "wrong credentials / no session", not "token expired":
// refreshing and retrying would be pointless (or loop forever, for /refresh itself).
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/csrf',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// ─── Session-expired hook ───
// The client can't import the Redux store (that would create an import cycle), so the
// store registers a callback here instead. Called when a refresh fails = really logged out.
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// ─── CSRF token ───
let csrfToken = null;
let csrfRequest = null;

/** Fetches the CSRF token once; parallel callers share the same request. */
function getCsrfToken() {
  if (csrfToken) return Promise.resolve(csrfToken);
  csrfRequest ??= apiClient
    .get('/auth/csrf')
    .then((res) => (csrfToken = res.data.data.csrfToken))
    .finally(() => (csrfRequest = null));
  return csrfRequest;
}

apiClient.interceptors.request.use(async (config) => {
  if (UNSAFE_METHODS.has(config.method)) {
    config.headers['X-CSRF-Token'] = await getCsrfToken();
  }
  return config;
});

// ─── Silent refresh (single-flight) ───
let refreshRequest = null;

/**
 * If 5 requests fail with 401 at the same moment, only ONE refresh call is made and
 * all 5 wait for it. Five separate refreshes would replay a rotated refresh token,
 * which the server treats as theft and answers by ending the session.
 */
function refreshSession() {
  refreshRequest ??= apiClient
    .post('/auth/refresh', undefined, { skipAuthRefresh: true })
    .catch((error) => {
      // Refresh failed = the session is really over. Signal it ONCE, here, rather than
      // once per waiting request.
      onSessionExpired();
      throw error;
    })
    .finally(() => (refreshRequest = null));
  return refreshRequest;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (!config || !response) throw error; // network error / timeout: nothing to retry

    const code = response.data?.error?.code;

    // CSRF token missing or stale (e.g. cookies cleared): get a fresh one, retry once.
    if (response.status === 403 && code === 'CSRF_INVALID' && !config.csrfRetried) {
      csrfToken = null;
      config.csrfRetried = true;
      return apiClient(config);
    }

    const refreshAllowed =
      !config.skipAuthRefresh && !NO_REFRESH_PATHS.some((path) => config.url?.startsWith(path));

    if (response.status === 401 && refreshAllowed && !config.authRetried) {
      config.authRetried = true;
      try {
        await refreshSession();
      } catch {
        throw error; // the original 401
      }
      return apiClient(config);
    }

    throw error;
  },
);

/**
 * Turns any failure into one predictable shape for the UI:
 *   { status, code, message, details? }
 */
export function toApiError(error) {
  if (error.response) {
    const body = error.response.data?.error;
    return {
      status: error.response.status,
      code: body?.code ?? 'HTTP_ERROR',
      message: body?.message ?? 'Something went wrong. Please try again.',
      details: body?.details,
    };
  }
  if (error.code === 'ECONNABORTED') {
    return { status: 0, code: 'TIMEOUT', message: 'The server took too long to respond.' };
  }
  return {
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the server. Check your internet connection.',
  };
}
