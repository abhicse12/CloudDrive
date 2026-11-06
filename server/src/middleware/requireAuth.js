import { sessionRepository } from '../repositories/session.repository.js';
import { verifyAccessToken } from '../services/token.service.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIES } from '../utils/cookies.js';

/**
 * Protects a route: only logged-in users with a live session get through.
 *
 * 1. Verify the JWT signature + expiry (no database needed).
 * 2. Load its session + user (one indexed lookup) and check the session wasn't logged
 *    out and the user isn't suspended. This extra step is what makes logout and
 *    suspension take effect IMMEDIATELY instead of when the JWT expires.
 *
 * On success: req.user (full user row, server-side only) and req.auth = { userId, sessionId, role }.
 */
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[AUTH_COOKIES.access];
  if (!token) throw AppError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    // TOKEN_EXPIRED tells the frontend "call /refresh and retry".
    if (err.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired.');
    }
    throw AppError.unauthorized('Invalid access token.');
  }

  const session = await sessionRepository.findById(payload.sid);
  const valid =
    session &&
    session.userId === payload.sub &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    session.user.status === 'ACTIVE';

  if (!valid) throw AppError.unauthorized('Your session is no longer valid. Please log in again.');

  req.user = session.user;
  req.auth = { userId: session.user.id, sessionId: session.id, role: session.user.role };
  next();
}
