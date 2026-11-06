import { prisma } from '../config/prisma.js';

export const passwordResetRepository = {
  create(data) {
    return prisma.passwordResetToken.create({ data });
  },

  findByTokenHash(tokenHash, db = prisma) {
    return db.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  /**
   * Marks a token as used, but ONLY if it is still unused and unexpired.
   * Returns true for exactly one caller, even if the same link is submitted twice at once.
   */
  async consume(tokenHash, db = prisma) {
    const { count } = await db.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return count === 1;
  },

  /** Invalidates every still-unused token of a user (only the newest link should work). */
  invalidateAllForUser(userId, db = prisma) {
    return db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
};
