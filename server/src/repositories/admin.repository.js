import { prisma } from '../config/prisma.js';
import { escapeLike } from '../utils/escapeLike.js';
import { FILE_STATE } from './file.repository.js';

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
