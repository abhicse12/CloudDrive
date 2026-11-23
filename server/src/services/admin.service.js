import { prisma } from '../config/prisma.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { adminRepository } from '../repositories/admin.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { AppError } from '../utils/AppError.js';
import { pageMeta, toSkipTake } from '../utils/pagination.js';
import { FILE_CATEGORIES } from '../validators/file.validators.js';

const SORT_FIELDS = {
  createdAt: 'createdAt',
  name: 'name',
  email: 'email',
  storageUsed: 'storageUsed',
};

const userNotFound = () => AppError.notFound('User not found.');

const isActiveAdmin = (user) => user.role === 'ADMIN' && user.status === 'ACTIVE';

/** Only the fields whose value actually changes, as { field: { from, to } }. */
function diffUser(user, changes) {
  const current = {
    role: user.role,
    status: user.status,
    storageLimit: Number(user.storageLimit),
  };
  return Object.fromEntries(
    Object.entries(changes)
      .filter(([field, value]) => value !== undefined && value !== current[field])
      .map(([field, value]) => [field, { from: current[field], to: value }]),
  );
}

const toNumber = (bigint) => Number(bigint ?? 0n);

export const adminService = {
  async stats() {
    const { usersByState, files, byCategory, storage, activeShares, signups, top } =
      await adminRepository.stats();

    const countUsers = (match) =>
      usersByState.filter(match).reduce((sum, row) => sum + row._count._all, 0);

    // Every category is always present (zeros included), like the user dashboard.
    const rows = new Map(byCategory.map((row) => [row.category, row]));

    return {
      users: {
        total: countUsers(() => true),
        active: countUsers((row) => row.status === 'ACTIVE'),
        suspended: countUsers((row) => row.status === 'SUSPENDED'),
        admins: countUsers((row) => row.role === 'ADMIN' && row.status === 'ACTIVE'),
      },
      files: { count: files._count._all, bytes: toNumber(files._sum.sizeBytes) },
      storage: {
        // Includes trash and uploads in progress: what users are actually charged for.
        used: toNumber(storage._sum.storageUsed),
        // Sum of every user's quota: how much has been promised, not what's on disk.
        allocated: toNumber(storage._sum.storageLimit),
      },
      activeShares,
      signups: {
        days: signups,
        total: signups.reduce((sum, day) => sum + day.count, 0),
      },
      byCategory: FILE_CATEGORIES.map((category) => ({
        category,
        count: rows.get(category)?._count._all ?? 0,
        bytes: toNumber(rows.get(category)?._sum.sizeBytes),
      })),
      topUsers: top,
    };
  },

  async listUsers(query) {
    const { users, total } = await adminRepository.listUsers({
      q: query.q,
      role: query.role,
      status: query.status,
      // id as a tie-breaker keeps pages stable when values are equal.
      orderBy: [{ [SORT_FIELDS[query.sortBy]]: query.sortOrder }, { id: 'asc' }],
      ...toSkipTake(query),
    });
    return { users, meta: pageMeta(query, total) };
  },

  /**
   * Changes a user's role, status and/or storage limit.
   *
   * Rules (409 when broken):
   *   - an admin can't remove their own admin access or suspend themselves;
   *   - the LAST active admin can't be demoted or suspended (by anyone), even when two
   *     admins try to demote each other at the same moment;
   *   - the storage limit can't go below what the user already stores.
   * Suspending also logs the user out everywhere. Every real change is audit-logged.
   */
  async updateUser(actorId, targetId, changes) {
    const target = await adminRepository.findUser(targetId);
    if (!target) throw userNotFound();

    const diff = diffUser(target, changes);
    if (Object.keys(diff).length === 0) return target;

    const after = { role: diff.role?.to ?? target.role, status: diff.status?.to ?? target.status };
    const losesAdminAccess = isActiveAdmin(target) && !isActiveAdmin(after);

    if (losesAdminAccess && actorId === targetId) {
      throw new AppError(
        409,
        'CANNOT_CHANGE_OWN_ACCESS',
        "You can't remove your own admin access or suspend yourself.",
      );
    }

    return prisma.$transaction(async (tx) => {
      if (losesAdminAccess) {
        const admins = await adminRepository.lockActiveAdmins(tx);
        if (!admins.some((id) => id !== targetId)) {
          throw new AppError(
            409,
            'LAST_ADMIN',
            'This is the last active admin. Make someone else an admin first.',
          );
        }
      }

      const values = Object.fromEntries(Object.entries(diff).map(([f, { to }]) => [f, to]));
      if ((await adminRepository.updateUser(targetId, values, tx)) === 0) {
        throw new AppError(
          409,
          'LIMIT_BELOW_USAGE',
          'The storage limit cannot be lower than what this user already stores.',
          [{ field: 'storageLimit', message: `In use: ${Number(target.storageUsed)} bytes.` }],
        );
      }

      // requireAuth already blocks suspended users on every request; revoking their
      // sessions as well means they also can't refresh, even after being reactivated.
      if (diff.status?.to === 'SUSPENDED') {
        await sessionRepository.revokeAllForUser(targetId, {}, tx);
      }

      await activityRepository.record(
        {
          userId: actorId,
          action: 'ADMIN_USER_UPDATED',
          targetType: 'ACCOUNT',
          targetId,
          metadata: { name: target.name, email: target.email, changes: diff },
        },
        tx,
      );
      return adminRepository.findUser(targetId, tx);
    });
  },
};
