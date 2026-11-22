import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';

/** Preset lifetimes only: easy to validate, easy to show in the UI. */
export const SHARE_EXPIRY_OPTIONS = ['1h', '1d', '7d', '30d', 'never'];

export const SHARE_STATUSES = ['active', 'expired', 'revoked'];

export const createShareBody = z.strictObject({
  expiresIn: z.enum(SHARE_EXPIRY_OPTIONS).default('7d'),
});

// status omitted = every share, newest first.
export const listSharesQuery = z.strictObject({
  status: z.enum(SHARE_STATUSES).optional(),
  ...paginationQuery,
});
