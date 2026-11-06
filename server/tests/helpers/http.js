import request from 'supertest';
import { generateOpaqueToken } from '../../src/services/token.service.js';

/**
 * Stateless client for one-off requests with explicit cookies. Every state-changing
 * request automatically carries a valid CSRF cookie + header, like the real frontend.
 *
 *   const http = api(app);
 *   await http.post('/api/auth/logout', { cookies: ['cd_refresh=abc'] }).send();
 */
export function api(app) {
  const csrfToken = generateOpaqueToken();

  const withCsrf =
    (method) =>
    (url, { cookies = [] } = {}) =>
      request(app)
        [method](url)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [`cd_csrf=${csrfToken}`, ...cookies]);

  return {
    get: (url, { cookies = [] } = {}) => {
      const req = request(app).get(url);
      return cookies.length ? req.set('Cookie', cookies) : req;
    },
    post: withCsrf('post'),
    patch: withCsrf('patch'),
    delete: withCsrf('delete'),
  };
}

/**
 * Browser-like client: keeps cookies between requests (a "cookie jar") and fetches
 * its CSRF token from the API first, exactly as the frontend will.
 */
export async function createAgent(app) {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/csrf');
  const { csrfToken } = res.body.data;

  return {
    csrfToken,
    get: (url) => agent.get(url),
    post: (url) => agent.post(url).set('X-CSRF-Token', csrfToken),
    patch: (url) => agent.patch(url).set('X-CSRF-Token', csrfToken),
    delete: (url) => agent.delete(url).set('X-CSRF-Token', csrfToken),
  };
}
