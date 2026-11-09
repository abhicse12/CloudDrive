import { z } from 'zod';

/** :id route parameter. A malformed ID is a 400 before any database work happens. */
export const idParams = z.strictObject({ id: z.uuid('Invalid ID.') });

export const sortOrder = z.enum(['asc', 'desc']);

/**
 * A file or folder name. Rejects names that are invisible, path-like, or could confuse
 * people or operating systems when the item is downloaded.
 */
export const itemName = z
  .string('Name is required.')
  .trim()
  .min(1, 'Name is required.')
  .max(255, 'Name must be at most 255 characters.')
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Name contains invalid characters.')
  .refine((value) => !/[/\\]/.test(value), 'Name cannot contain / or \\.')
  .refine((value) => value !== '.' && value !== '..', 'This name is not allowed.');
