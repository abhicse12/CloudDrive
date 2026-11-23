import { prisma } from '../config/prisma.js';
import { escapeLike } from '../utils/escapeLike.js';
import { FILE_STATE } from './file.repository.js';
import { activeShareWhere } from './share.repository.js';

/*
 * Admin queries work ACROSS users, which is exactly what every other repository must
 * never do. That's why they live here, behind routes that require the ADMIN role.
 * They return account data and usage numbers only, never anyone's files.
 */

// How many (active, not trashed) files each user has, for the users table.
const WITH_FILE_COUNT = { _count: { select: { files: { where: FILE_STATE.active } } } };

export const adminRepository = {
  async listUsers({ q, role, status, orderBy, skip, take }) {
    const where = {
      ...(role && { role }),
      ...(status && { status }),
      ...(q && {
        OR: [
          { name: { contains: escapeLike(q), mode: 'insensitive' } },
          { email: { contains: escapeLike(q), mode: 'insensitive' } },
        ],
      }),
    };
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, orderBy, skip, take, include: WITH_FILE_COUNT }),
      prisma.user.count({ where }),
    ]);
    return { users, total };
  },

  /**
   * Every number for the admin dashboard, in ONE transaction so they describe the same
   * moment. Only ACTIVE (fully uploaded) files count; storage_used also includes trash
   * and uploads in progress, because that is what users are charged for.
   */
  async stats({ now = new Date(), days = 30, topUsers = 5 } = {}) {
    const [usersByState, files, byCategory, storage, activeShares, signups, top] =
      await prisma.$transaction([
        prisma.user.groupBy({
          by: ['role', 'status'],
          _count: { _all: true },
          orderBy: [{ role: 'asc' }, { status: 'asc' }],
        }),
        prisma.file.aggregate({
          where: FILE_STATE.active,
          _count: { _all: true },
          _sum: { sizeBytes: true },
        }),
        prisma.file.groupBy({
          by: ['category'],
          where: FILE_STATE.active,
          _count: { _all: true },
          _sum: { sizeBytes: true },
          orderBy: { category: 'asc' },
        }),
        prisma.user.aggregate({ _sum: { storageUsed: true, storageLimit: true } }),
        prisma.share.count({
          // Links that work right now: active share AND the file is not in trash.
          where: { ...activeShareWhere(now), file: FILE_STATE.active },
        }),
        // One row per UTC day, oldest first. generate_series makes the days and the
        // LEFT JOIN keeps days without sign-ups (count 0), so the chart has no gaps.
        prisma.$queryRaw`
          SELECT to_char(day, 'YYYY-MM-DD') AS date, COUNT(u.id)::int AS count
          FROM generate_series(
            (${now}::timestamptz AT TIME ZONE 'UTC')::date - ${days - 1}::int,
            (${now}::timestamptz AT TIME ZONE 'UTC')::date,
            interval '1 day'
          ) AS day
          LEFT JOIN users u ON (u.created_at AT TIME ZONE 'UTC')::date = day::date
          GROUP BY day
          ORDER BY day`,
        prisma.user.findMany({
          orderBy: [{ storageUsed: 'desc' }, { id: 'asc' }],
          take: topUsers,
          include: WITH_FILE_COUNT,
        }),
      ]);
    return { usersByState, files, byCategory, storage, activeShares, signups, top };
  },

  findUser(id, db = prisma) {
    return db.user.findUnique({ where: { id }, include: WITH_FILE_COUNT });
  },

  /**
   * Locks every active admin row until the transaction ends (SELECT ... FOR UPDATE).
   * A second transaction that wants to remove an admin waits here until the first one
   * commits, and then sees the NEW state, so two admins demoting each other at the
   * same moment can never leave the system with no admin at all.
   */
  async lockActiveAdmins(db) {
    const rows = await db.$queryRaw`
      SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE`;
    return rows.map((row) => row.id);
  },

  /**
   * Applies role/status/limit changes in one UPDATE. A new storage limit is only applied
   * if the user's current usage fits under it, checked in the same statement, so a
   * parallel upload can't slip in between the check and the write.
   * Returns 1 if the row was updated, 0 if the limit didn't fit.
   */
  async updateUser(id, { storageLimit, ...rest }, db) {
    const limit = storageLimit === undefined ? undefined : BigInt(storageLimit);
    const { count } = await db.user.updateMany({
      where: { id, ...(limit !== undefined && { storageUsed: { lte: limit } }) },
      data: { ...rest, ...(limit !== undefined && { storageLimit: limit }) },
    });
    return count;
  },
};
