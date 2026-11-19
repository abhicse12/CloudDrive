import { prisma } from '../config/prisma.js';

export const activityRepository = {
  /** Records an event for the user's "Recent activity" feed and the admin audit trail. */
  record({ userId, action, targetType, targetId = null, metadata }, db = prisma) {
    return db.activityLog.create({
      data: { userId, action, targetType, targetId, metadata },
    });
  },

  /** Several events in one INSERT (bulk actions). */
  recordMany(entries, db = prisma) {
    if (entries.length === 0) return Promise.resolve({ count: 0 });
    return db.activityLog.createMany({ data: entries });
  },
};
