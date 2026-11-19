import { prisma } from '../config/prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Logged-out sessions are kept a week: useful when investigating "was I hacked?".
const KEEP_REVOKED_MS = 7 * DAY_MS;

/** Removes sessions and password reset tokens that can never be used again. */
export async function purgeAuthRecords({ now = new Date() } = {}) {
  const [sessions, resetTokens] = await Promise.all([
    prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revokedAt: { lt: new Date(now.getTime() - KEEP_REVOKED_MS) } },
        ],
      },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
  ]);
  return { sessions: sessions.count, resetTokens: resetTokens.count };
}
