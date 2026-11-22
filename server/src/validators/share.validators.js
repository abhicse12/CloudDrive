import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';

/** Preset lifetimes only: easy to validate, easy to show in the UI. */
export const SHARE_EXPIRY_OPTIONS = ['1h', '1d', '7d', '30d', 'never'];

export const SHARE_STATUSES = ['active', 'expired', 'revoked'];

export const createShareBody = z.strictObject({
  expiresIn: z.enum(SHARE_EXPIRY_OPTIONS).default('7d'),
});

// The token's format is checked by the service, so a malformed token gets the same
// 404 as any other bad link (a 400 here would single it out).
export const publicShareParams = z.strictObject({ token: z.string().max(100) });

export const publicDownloadQuery = z.strictObject({
  disposition: z.enum(['attachment', 'inline']).default('attachment'),
});

// status omitted = every share, newest first.
export const listSharesQuery = z.strictObject({
  status: z.enum(SHARE_STATUSES).optional(),
  ...paginationQuery,
});
