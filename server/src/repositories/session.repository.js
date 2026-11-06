import { prisma } from '../config/prisma.js';

export const sessionRepository = {
  create(data) {
    return prisma.session.create({ data });
  },

  findById(id) {
    return prisma.session.findUnique({ where: { id }, include: { user: true } });
  },

  findByRefreshTokenHash(refreshTokenHash) {
    return prisma.session.findUnique({ where: { refreshTokenHash }, include: { user: true } });
  },

  findByPreviousTokenHash(previousTokenHash) {
    return prisma.session.findUnique({ where: { previousTokenHash } });
  },

  /**
   * Swaps in a new refresh token, but only if the old one is still current.
   * The condition makes this atomic: if two requests race to rotate the same token,
   * exactly one wins (count = 1) and the other gets count = 0.
   * The old hash is kept in previousTokenHash so a later replay of it can be detected.
   */
  async rotateRefreshToken(id, { currentHash, newHash, expiresAt }) {
    const { count } = await prisma.session.updateMany({
      where: { id, refreshTokenHash: currentHash, revokedAt: null },
      data: {
        refreshTokenHash: newHash,
        previousTokenHash: currentHash,
        rotatedAt: new Date(),
        expiresAt,
      },
    });
    return count === 1;
  },

  revoke(id) {
    return prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Logs a user out everywhere, optionally keeping one session (the current device). */
  revokeAllForUser(userId, { exceptSessionId } = {}, db = prisma) {
    return db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId && { id: { not: exceptSessionId } }),
      },
      data: { revokedAt: new Date() },
    });
  },
};
