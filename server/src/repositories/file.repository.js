import { prisma } from '../config/prisma.js';
import { escapeLike } from '../utils/escapeLike.js';
import { activeShareWhere } from './share.repository.js';

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
 * Adds _count.shares = number of WORKING share links, which toFileDto turns into
 * `isShared`. A function, not a constant: "not expired" must use the current time.
 * Postgres answers it with one indexed subquery per row (shares.file_id index).
 */
export const withShareCount = () => ({
  _count: { select: { shares: { where: activeShareWhere() } } },
});

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
    return prisma.file.findFirst({
      where: { id, userId, ...FILE_STATE[state] },
      include: withShareCount(),
    });
  },

  findManyOwned(userId, ids, state) {
    return prisma.file.findMany({
      where: { id: { in: ids }, userId, ...FILE_STATE[state] },
      select: SUMMARY,
    });
  },

  update(id, data) {
    return prisma.file.update({ where: { id }, data, include: withShareCount() });
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

  /** Every file (any status) inside the given folders: for permanent folder delete. */
  findInFolders(userId, folderIds) {
    return prisma.file.findMany({
      where: { userId, folderId: { in: folderIds } },
      select: { ...SUMMARY, status: true },
    });
  },

  /**
   * Deletes the rows and returns the ones THIS call deleted (DELETE ... RETURNING), so
   * the caller frees exactly their bytes, even if a parallel request deleted some first.
   */
  deleteManyReturning(userId, ids, db = prisma) {
    return db.$queryRaw`
      DELETE FROM files
      WHERE user_id = ${userId}::uuid AND id = ANY(${ids}::uuid[])
      RETURNING id, size_bytes AS "sizeBytes", status::text AS status`;
  },

  /** Trashed files whose folder is NOT trashed (the trash page), newest first. */
  async listTrashedTopLevel(userId, { skip, take }) {
    const where = {
      userId,
      ...FILE_STATE.trashed,
      OR: [{ folderId: null }, { folder: { deletedAt: null } }],
    };
    const [files, total] = await prisma.$transaction([
      prisma.file.findMany({ where, orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }], skip, take }),
      prisma.file.count({ where }),
    ]);
    return { files, total };
  },

  async trashedIds(userId) {
    const rows = await prisma.file.findMany({
      where: { userId, ...FILE_STATE.trashed },
      select: { id: true },
    });
    return rows.map((row) => row.id);
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
      prisma.file.findMany({ where, orderBy, skip, take, include: withShareCount() }),
      prisma.file.count({ where }),
    ]);
    return { files, total };
  },
};
