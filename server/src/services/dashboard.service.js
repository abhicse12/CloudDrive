import { dashboardRepository } from '../repositories/dashboard.repository.js';
import { FILE_CATEGORIES } from '../validators/file.validators.js';

const toNumber = (bigint) => Number(bigint ?? 0n);

export const dashboardService = {
  async stats(userId) {
    const { user, byCategory, folderCount, trash } = await dashboardRepository.stats(userId);

    const used = toNumber(user.storageUsed);
    const limit = toNumber(user.storageLimit);

    // Every category is always present (zeros included), so the chart's legend and
    // colours stay the same whether or not the user has, say, any videos.
    const rows = new Map(byCategory.map((row) => [row.category, row]));
    const categories = FILE_CATEGORIES.map((category) => ({
      category,
      count: rows.get(category)?._count._all ?? 0,
      bytes: toNumber(rows.get(category)?._sum.sizeBytes),
    }));

    return {
      storageUsed: used,
      storageLimit: limit,
      remaining: Math.max(0, limit - used),
      // One decimal (42.7%). A limit of 0 (admin-set) counts as full, not "divide by 0".
      percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 100,
      fileCount: categories.reduce((sum, row) => sum + row.count, 0),
      folderCount,
      byCategory: categories,
      // Trash still counts toward the quota until it's emptied: show how much it frees.
      trashBytes: toNumber(trash._sum.sizeBytes),
      trashFileCount: trash._count._all,
    };
  },

  recentFiles(userId, { limit }) {
    return dashboardRepository.recentFiles(userId, limit);
  },

  activity(userId, query) {
    return dashboardRepository.activity(userId, query);
  },
};
