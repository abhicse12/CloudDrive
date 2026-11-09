import { prisma } from '../config/prisma.js';

/*
 * Every query is scoped by userId (IDOR protection, see folder.repository.js).
 * "Visible" files = ACTIVE (fully uploaded) and not in trash.
 */
const visible = (userId) => ({ userId, status: 'ACTIVE', deletedAt: null });

/**
 * Prisma's `contains` becomes LIKE '%<value>%' WITHOUT escaping, so a search for "%"
 * or "_" would act as a wildcard and match everything. Escape them (and the escape
 * character itself) so they're matched literally.
 */
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

export const fileRepository = {
  /**
   * Atomically reserves `bytes` of the user's quota. Returns false if it doesn't fit.
   *
   * One conditional UPDATE, not "read storageUsed, check, write": Postgres locks the
   * user's row for this statement, so two parallel uploads can't both see the same
   * free space and together overshoot the limit (a race condition).
   */
  async reserveQuota(userId, bytes, db = prisma) {
    const updated = await db.$executeRaw`
      UPDATE users
      SET storage_used = storage_used + ${bytes}
      WHERE id = ${userId}::uuid
        AND status = 'ACTIVE'
        AND storage_used + ${bytes} <= storage_limit`;
    return updated === 1;
  },

  /** Gives reserved/used bytes back. GREATEST: never below 0, even after a bug. */
  releaseQuota(userId, bytes, db = prisma) {
    return db.$executeRaw`
      UPDATE users
      SET storage_used = GREATEST(storage_used - ${bytes}, 0)
      WHERE id = ${userId}::uuid`;
  },

  create(data, db = prisma) {
    return db.file.create({ data });
  },

  setStatus(id, status, db = prisma) {
    return db.file.update({ where: { id }, data: { status } });
  },

  /**
   * One page of files plus the total count, in one transaction so they agree.
   * folderId: a UUID or null (the root); undefined = every folder (search).
   */
  async list(userId, { folderId, q, category, orderBy, skip, take }) {
    const where = {
      ...visible(userId),
      ...(folderId !== undefined && { folderId }),
      ...(category && { category }),
      // ILIKE '%q%', sped up by the trigram index on original_name.
      ...(q && { originalName: { contains: escapeLike(q), mode: 'insensitive' } }),
    };
    const [files, total] = await prisma.$transaction([
      prisma.file.findMany({ where, orderBy, skip, take }),
      prisma.file.count({ where }),
    ]);
    return { files, total };
  },
};
