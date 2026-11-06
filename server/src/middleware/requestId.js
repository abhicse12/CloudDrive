import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[\w-]{1,64}$/;

/**
 * Gives every request a unique ID, returned in the X-Request-Id header and attached to
 * every log line. When a user reports an error, its requestId finds the exact logs.
 * An incoming ID (e.g. from a load balancer) is reused only if it looks safe.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}
