import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The API client keeps state (CSRF token, in-flight refresh) in module variables, so
 * each test imports a FRESH copy and replaces the network layer ("adapter") with a fake
 * server that records every call.
 */
async function setup(handle) {
  vi.resetModules();
  const mod = await import('./apiClient.js');
  const calls = [];

  mod.apiClient.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, csrf: config.headers['X-CSRF-Token'] });
    // Let parallel requests overlap, like on a real network.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { status = 200, data = {} } = handle(config, calls) ?? {};
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, null, response);
    }
    return response;
  };

  const onSessionExpired = vi.fn();
  mod.setSessionExpiredHandler(onSessionExpired);
  return { ...mod, calls, onSessionExpired };
}

const csrfResponse = { data: { data: { csrfToken: 'csrf-123' } } };
const count = (calls, url) => calls.filter((c) => c.url === url).length;

describe('CSRF header', () => {
  it('fetches the token once and adds it to every state-changing request', async () => {
    const { apiClient, calls } = await setup((config) =>
      config.url === '/auth/csrf' ? csrfResponse : { data: { data: 'ok' } },
    );

    await Promise.all([apiClient.post('/a'), apiClient.patch('/b'), apiClient.delete('/c')]);

    expect(count(calls, '/auth/csrf')).toBe(1);
    expect(calls.filter((c) => c.url !== '/auth/csrf').every((c) => c.csrf === 'csrf-123')).toBe(
      true,
    );
  });

  it('does not add it to GET requests', async () => {
    const { apiClient, calls } = await setup(() => ({}));

    await apiClient.get('/files');

    expect(calls).toEqual([{ method: 'get', url: '/files', csrf: undefined }]);
  });

  it('fetches a fresh token and retries once after CSRF_INVALID', async () => {
    let csrfFetches = 0;
    const { apiClient, calls } = await setup((config) => {
      if (config.url === '/auth/csrf') {
        csrfFetches += 1;
        return { data: { data: { csrfToken: `csrf-${csrfFetches}` } } };
      }
      if (config.headers['X-CSRF-Token'] === 'csrf-1') {
        return { status: 403, data: { error: { code: 'CSRF_INVALID' } } };
      }
      return {};
    });

    await apiClient.post('/a');

    expect(calls.map((c) => c.url)).toEqual(['/auth/csrf', '/a', '/auth/csrf', '/a']);
    expect(calls.at(-1).csrf).toBe('csrf-2');
  });
});

describe('silent refresh', () => {
  it('refreshes on 401 and retries the original request', async () => {
    let refreshed = false;
    const { apiClient, calls } = await setup((config) => {
      if (config.url === '/auth/csrf') return csrfResponse;
      if (config.url === '/auth/refresh') {
        refreshed = true;
        return {};
      }
      return refreshed ? { data: { data: 'files' } } : { status: 401 };
    });

    const res = await apiClient.get('/files');

    expect(res.data.data).toBe('files');
    expect(calls.map((c) => c.url)).toEqual(['/files', '/auth/csrf', '/auth/refresh', '/files']);
  });

  it('makes only ONE refresh call when several requests fail at once (single-flight)', async () => {
    let refreshed = false;
    const { apiClient, calls } = await setup((config) => {
      if (config.url === '/auth/csrf') return csrfResponse;
      if (config.url === '/auth/refresh') {
        refreshed = true;
        return {};
      }
      return refreshed ? {} : { status: 401 };
    });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

    expect(count(calls, '/auth/refresh')).toBe(1);
  });

  it('signals session expiry once when the refresh fails, and rejects with the 401', async () => {
    const { apiClient, calls, onSessionExpired } = await setup((config) =>
      config.url === '/auth/csrf' ? csrfResponse : { status: 401 },
    );

    const results = await Promise.allSettled([apiClient.get('/a'), apiClient.get('/b')]);

    expect(results.every((r) => r.status === 'rejected' && r.reason.response.status === 401)).toBe(
      true,
    );
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(count(calls, '/auth/refresh')).toBe(1);
  });

  it('never tries to refresh after a failed login (wrong password is not an expired session)', async () => {
    const { apiClient, calls, onSessionExpired } = await setup((config) =>
      config.url === '/auth/csrf' ? csrfResponse : { status: 401 },
    );

    await expect(apiClient.post('/auth/login', {})).rejects.toThrow();

    expect(count(calls, '/auth/refresh')).toBe(0);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('retries a request at most once, even if it fails with 401 again', async () => {
    const { apiClient, calls } = await setup((config) => {
      if (config.url === '/auth/csrf') return csrfResponse;
      if (config.url === '/auth/refresh') return {};
      return { status: 401 };
    });

    await expect(apiClient.get('/files')).rejects.toThrow();

    expect(count(calls, '/files')).toBe(2);
  });
});

describe('toApiError', () => {
  let toApiError;
  beforeEach(async () => {
    ({ toApiError } = await setup(() => ({})));
  });

  it('uses the API error body when there is one', () => {
    const error = new AxiosError('x', 'ERR', {}, null, {
      status: 409,
      data: { error: { code: 'EMAIL_TAKEN', message: 'Taken', details: [1] } },
    });

    expect(toApiError(error)).toEqual({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Taken',
      details: [1],
    });
  });

  it('describes network failures and timeouts in plain language', () => {
    expect(toApiError(new AxiosError('x', 'ERR_NETWORK')).code).toBe('NETWORK_ERROR');
    expect(toApiError(new AxiosError('x', 'ECONNABORTED')).code).toBe('TIMEOUT');
  });
});
