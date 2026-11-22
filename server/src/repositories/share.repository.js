import { prisma } from '../config/prisma.js';

/*
 * A share has no userId column of its own: it belongs to whoever owns its FILE.
 * So every owner query is scoped through the relation: { file: { userId } }.
 */
const owned = (userId) => ({ file: { userId } });

/** Not revoked and not expired (yet). `now` is a parameter so one request uses one clock. */
export const activeShareWhere = (now = new Date()) => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

// The three statuses never overlap: revoked wins over expired.
const STATUS_WHERE = {
  active: activeShareWhere,
  expired: (now) => ({ revokedAt: null, expiresAt: { lte: now } }),
  revoked: () => ({ revokedAt: { not: null } }),
};

const WITH_FILE = { file: true };

export const shareRepository = {
  create({ fileId, tokenHash, expiresAt }, db = prisma) {
    return db.share.create({ data: { fileId, tokenHash, expiresAt }, include: WITH_FILE });
  },

  findOwned(userId, id) {
    return prisma.share.findFirst({ where: { id, ...owned(userId) }, include: WITH_FILE });
  },

  /** One page of the user's shares plus the total, in one transaction so they agree. */
  async list(userId, { status, skip, take, now = new Date() }) {
    const where = { ...owned(userId), ...(status && STATUS_WHERE[status](now)) };
    const [shares, total] = await prisma.$transaction([
      prisma.share.findMany({
        where,
        include: WITH_FILE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.share.count({ where }),
    ]);
    return { shares, total };
  },

  /**
   * Public lookup by token hash. EVERY condition for a working link is in this one
   * query (not separate reads), so there is no gap between "checked" and "used":
   * not revoked, not expired, file fully uploaded and not in trash, owner not suspended.
   * A trashed folder trashes its files too, so that case is covered by deletedAt.
   */
  findPublic(tokenHash, now = new Date()) {
    return prisma.share.findFirst({
      where: {
        tokenHash,
        ...activeShareWhere(now),
        file: { status: 'ACTIVE', deletedAt: null, user: { status: 'ACTIVE' } },
      },
      include: WITH_FILE,
    });
  },

  /**
   * Counts one download. `increment` runs inside the UPDATE (access_count + 1), so
   * parallel downloads can't overwrite each other's count, which reading the number in
   * JavaScript and writing it back would do.
   */
  recordAccess(id, now = new Date()) {
    return prisma.share.update({
      where: { id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: now },
    });
  },

  /**
   * Revokes the share if it isn't revoked yet. Returns 1 if THIS call revoked it, 0 if
   * it was already revoked (e.g. by a parallel request), so callers log it only once.
   * Still scoped to the owner: defence in depth, even though callers check first.
   */
  async revoke(userId, id, db = prisma) {
    const { count } = await db.share.updateMany({
      where: { id, revokedAt: null, ...owned(userId) },
      data: { revokedAt: new Date() },
    });
    return count;
  },
};
