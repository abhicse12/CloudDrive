import { z } from 'zod';

/**
 * Offset pagination: ?page=1&pageSize=50 → meta { page, pageSize, total, totalPages }.
 * Spread into any list query schema:  z.strictObject({ ...paginationQuery, q: ... })
 */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
};

/** page/pageSize → Prisma's skip/take. */
export function toSkipTake({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta({ page, pageSize }, total) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
