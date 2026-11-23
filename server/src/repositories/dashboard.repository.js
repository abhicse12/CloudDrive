import { prisma } from '../config/prisma.js';
import { FILE_STATE, withShareState } from './file.repository.js';

export const dashboardRepository = {
  /**
   * Every number for the storage card in ONE transaction, so they all describe the
   * same moment (an upload finishing mid-way can't make the parts disagree).
   * "Usage by category" is a single GROUP BY on the indexed category column.
   */
  async stats(userId) {
    const [user, byCategory, folderCount, trash] = await prisma.$transaction([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { storageUsed: true, storageLimit: true },
      }),
      prisma.file.groupBy({
        by: ['category'],
        where: { userId, ...FILE_STATE.active },
        _count: { _all: true },
        _sum: { sizeBytes: true },
        orderBy: { category: 'asc' },
      }),
      prisma.folder.count({ where: { userId, deletedAt: null } }),
      prisma.file.aggregate({
        where: { userId, ...FILE_STATE.trashed },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
    ]);
    return { user, byCategory, folderCount, trash };
  },

  async recentFiles(userId, limit) {
    const files = await prisma.file.findMany({
      where: { userId, ...FILE_STATE.active },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return withShareState(files);
  },

  /**
   * Newest first. Cursor pagination: `cursor` is the ID of the last entry already shown,
   * and skip: 1 starts right AFTER it. Prisma continues from that row's position in the
   * full sort order (createdAt, then id), so entries sharing a timestamp (a bulk action
   * logs several at once) are never skipped, which a plain "createdAt < x" would do.
   */
  activity(userId, { limit, cursor }) {
    return prisma.activityLog.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
  },
};
