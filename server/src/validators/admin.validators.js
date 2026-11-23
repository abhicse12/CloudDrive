import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';
import { sortOrder } from './common.validators.js';

export const ROLES = ['USER', 'ADMIN'];
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'];

// 1 PiB: far above any real plan, and still exact as a JavaScript number.
const MAX_STORAGE_LIMIT = 1024 ** 5;

const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const listUsersQuery = z.strictObject({
  // Matches name or email, case-insensitive.
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sortBy: z.enum(['createdAt', 'name', 'email', 'storageUsed']).default('createdAt'),
  sortOrder: sortOrder.default('desc'),
  ...paginationQuery,
});

/**
 * Only these three fields can be changed by an admin. strictObject rejects anything
 * else (email, passwordHash, storageUsed...), so this can't become mass assignment.
 */
export const updateUserBody = z
  .strictObject({
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    storageLimit: z
      .number('Storage limit must be a number of bytes.')
      .int('Storage limit must be a whole number of bytes.')
      .min(0, 'Storage limit cannot be negative.')
      .max(MAX_STORAGE_LIMIT, 'Storage limit is too large.')
      .optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nothing to update.',
  });
