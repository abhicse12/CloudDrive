import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken, hashToken, signAccessToken } from './token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

const invalidRefreshToken = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired. Please log in again.');

/**
 * Used when a login email doesn't exist. Comparing against a real bcrypt hash anyway
 * makes "unknown email" take as long as "wrong password", so attackers can't discover
 * which emails have accounts by measuring response times.
 * Computed once at startup (not on first use), so even the FIRST unknown-email login
 * costs one bcrypt operation, exactly like a wrong password.
 */
const dummyHashPromise = bcrypt.hash('timing-equaliser-not-a-real-password', env.BCRYPT_ROUNDS);
const getDummyHash = () => dummyHashPromise;

function refreshExpiry() {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
}

function isActiveSession(session) {
  return Boolean(
    session &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    session.user.status === 'ACTIVE',
  );
}

/**
 * Refresh-token reuse detection.
 *
 * Each refresh token is valid exactly once. If an ALREADY-ROTATED token shows up again,
 * two parties hold copies of it: the real user and (probably) a thief. We can't tell
 * which request is which, so we end the whole session; the real user simply logs in
 * again, and the thief's copy becomes worthless.
 *
 * Grace period: two browser tabs may refresh at the same moment with the same cookie.
 * The loser of that race presents the just-rotated token a few milliseconds later.
 * That is not an attack, so replays within REUSE_GRACE_MS only fail; they don't revoke.
 */
const REUSE_GRACE_MS = 10_000;

async function detectRefreshTokenReuse(tokenHash) {
  const session = await sessionRepository.findByPreviousTokenHash(tokenHash);
  if (!session || session.revokedAt) return;

  const msSinceRotation = Date.now() - session.rotatedAt.getTime();
  if (msSinceRotation <= REUSE_GRACE_MS) return;

  await sessionRepository.revoke(session.id);
  logger.warn(
    { securityEvent: 'REFRESH_TOKEN_REUSE', sessionId: session.id, userId: session.userId },
    'Refresh token reuse detected - session revoked',
  );
}

/** Starts a new session (one per login/device) and issues its tokens. */
async function startSession(user, { ip, userAgent }) {
  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = refreshExpiry();

  const session = await sessionRepository.create({
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    ip,
    userAgent,
  });

  return {
    user,
    tokens: {
      accessToken: signAccessToken({ userId: user.id, sessionId: session.id }),
      refreshToken,
      refreshExpiresAt,
    },
  };
}

export const authService = {
  async register({ name, email, password }, context) {
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    let user;
    try {
      user = await userRepository.create({
        name,
        email,
        passwordHash,
        storageLimit: env.DEFAULT_STORAGE_LIMIT_BYTES,
      });
    } catch (err) {
      // We don't check "does this email exist?" first: two simultaneous sign-ups could
      // both pass that check. The UNIQUE constraint is the real guard; we translate it.
      if (err.code === 'P2002') {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
      throw err;
    }

    return startSession(user, context);
  },

  async login({ email, password }, context) {
    const user = await userRepository.findByEmail(email);
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? (await getDummyHash()),
    );

    // Same error for "no such email" and "wrong password": don't reveal which.
    if (!user || !passwordMatches) throw invalidCredentials();

    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended.');
    }

    return startSession(user, context);
  },

  /**
   * Exchanges a valid refresh token for a NEW access token AND a NEW refresh token
   * (rotation). The old refresh token stops working immediately, so a stolen copy
   * has a very short useful life.
   */
  async refresh(refreshToken) {
    if (!refreshToken) throw invalidRefreshToken();

    const currentHash = hashToken(refreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(currentHash);

    if (!session) {
      // Not the current token. Was it the PREVIOUS one, i.e. already used once?
      await detectRefreshTokenReuse(currentHash);
      throw invalidRefreshToken();
    }
    if (!isActiveSession(session)) throw invalidRefreshToken();

    const newRefreshToken = generateOpaqueToken();
    const refreshExpiresAt = refreshExpiry(); // sliding: 7 days from last use

    const rotated = await sessionRepository.rotateRefreshToken(session.id, {
      currentHash,
      newHash: hashToken(newRefreshToken),
      expiresAt: refreshExpiresAt,
    });
    // Lost a race with another request using the same token.
    if (!rotated) throw invalidRefreshToken();

    return {
      user: session.user,
      tokens: {
        accessToken: signAccessToken({ userId: session.userId, sessionId: session.id }),
        refreshToken: newRefreshToken,
        refreshExpiresAt,
      },
    };
  },

  /** Ends the session belonging to this refresh token. Safe to call repeatedly. */
  async logout(refreshToken) {
    if (!refreshToken) return;
    const session = await sessionRepository.findByRefreshTokenHash(hashToken(refreshToken));
    if (session) await sessionRepository.revoke(session.id);
  },
};
