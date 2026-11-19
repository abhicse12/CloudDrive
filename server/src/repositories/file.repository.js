import { prisma } from '../config/prisma.js';

/*
 * Every query is scoped by userId (IDOR protection, see folder.repository.js).
 * Only ACTIVE (fully uploaded) files are ever visible; UPLOADING/FAILED rows belong to
 * the upload pipeline and the cleanup job.
 */
export const FILE_STATE = {
  active: { status: 'ACTIVE', deletedAt: null },
  trashed: { status: 'ACTIVE', deletedAt: { not: null } },
};

/**
 * Prisma's `contains` becomes LIKE '%<value>%' WITHOUT escaping, so a search for "%"
 * or "_" would act as a wildcard and match everything. Escape them (and the escape
 * character itself) so they're matched literally.
 */
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

// What bulk operations need back from the rows they changed.
const SUMMARY = { id: true, originalName: true, folderId: true, storageKey: true, sizeBytes: true };

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

  /** One of the user's files in the given state ('active' | 'trashed'), or null. */
  findOwned(userId, id, state = 'active') {
    return prisma.file.findFirst({ where: { id, userId, ...FILE_STATE[state] } });
  },

  findManyOwned(userId, ids, state) {
    return prisma.file.findMany({
      where: { id: { in: ids }, userId, ...FILE_STATE[state] },
      select: SUMMARY,
    });
  },

  update(id, data) {
    return prisma.file.update({ where: { id }, data });
  },

  /**
   * Updates the user's files that are (still) in `state`, and returns exactly the rows
   * it changed, in ONE statement (UPDATE ... RETURNING). If two requests race to trash
   * the same file, only one of them gets it back, so nothing is logged twice.
   */
  updateManyInState(userId, ids, state, data, db = prisma) {
    return db.file.updateManyAndReturn({
      where: { id: { in: ids }, userId, ...FILE_STATE[state] },
      data,
      select: SUMMARY,
    });
  },

  /** Restored files whose folder is still in trash go back to the root instead. */
  detachFromTrashedFolders(ids, db = prisma) {
    return db.file.updateMany({
      where: { id: { in: ids }, folder: { deletedAt: { not: null } } },
      data: { folderId: null },
    });
  },

  /** Returns 1 if this call deleted the row, 0 if it was already gone. */
  async deleteOwned(userId, id, db = prisma) {
    const { count } = await db.file.deleteMany({ where: { id, userId } });
    return count;
  },

  /**
   * One page of files plus the total count, in one transaction so they agree.
   * folderId: a UUID or null (the root); undefined = every folder (search).
   */
  async list(userId, { folderId, q, category, orderBy, skip, take }) {
    const where = {
      userId,
      ...FILE_STATE.active,
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
