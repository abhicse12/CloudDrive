import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'clouddrive', audience: 'clouddrive-api' };

/**
 * Access token = a signed JWT. The server can check it with the secret alone (no database
 * read), but it can't be "taken back", which is why it lives only 15 minutes.
 * Payload is minimal: `sub` (user ID) and `sid` (session ID). No email, no role:
 * JWTs are only base64-encoded, not encrypted, so anyone holding one can read it.
 */
export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    subject: userId,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

/**
 * Throws if the token is expired, tampered with, or signed differently.
 * Pinning `algorithms` blocks the classic "alg: none" / algorithm-swap attacks.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_OPTIONS.algorithm],
    issuer: JWT_OPTIONS.issuer,
    audience: JWT_OPTIONS.audience,
  });
}

/**
 * Opaque random token (refresh tokens; later share links and password resets).
 * 32 bytes = 256 bits of randomness: impossible to guess. base64url is URL/cookie safe.
 */
export function generateOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

/**
 * Only this hash is stored in the database, never the token itself. A leaked database
 * then contains nothing an attacker can use as a token. SHA-256 (fast) is right here
 * because the token is already fully random; slow hashes like bcrypt are for passwords.
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
