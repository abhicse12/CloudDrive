import { z } from 'zod';

const limit = (fallback) => z.coerce.number().int().min(1).max(50).default(fallback);

export const recentFilesQuery = z.strictObject({ limit: limit(8) });

export const activityQuery = z.strictObject({
  limit: limit(10),
  // nextCursor from the previous page: the ID of the last entry already shown.
  cursor: z.uuid('Invalid cursor.').optional(),
});
