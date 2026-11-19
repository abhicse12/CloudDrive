import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';
import { itemName, sortOrder } from './common.validators.js';

export const FILE_CATEGORIES = ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'ARCHIVE', 'OTHER'];

// "?q=" (empty box) means "no search", not "match the empty string".
const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const listFilesQuery = z.strictObject({
  // A folder ID, or "all" for every folder. Omitted = the root, unless searching.
  folderId: z.union([z.literal('all'), z.uuid('Invalid folder ID.')]).optional(),
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  // Accepts "image" as well as "IMAGE".
  category: z.preprocess(
    (value) => (typeof value === 'string' ? value.toUpperCase() : value),
    z.enum(FILE_CATEGORIES).optional(),
  ),
  sortBy: z.enum(['name', 'size', 'createdAt']).default('name'),
  sortOrder: sortOrder.default('asc'),
  ...paginationQuery,
});

export const downloadQuery = z.strictObject({
  disposition: z.enum(['attachment', 'inline']).default('attachment'),
  // true = 302 redirect to the file (for <a href> / <img src>); false = JSON { url }.
  redirect: z.stringbool().default(false),
});

// Rename and/or move. folderId: null = move to root; omitted = don't move.
export const updateFileBody = z
  .strictObject({
    name: itemName.optional(),
    folderId: z.uuid('Invalid folder ID.').nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.folderId !== undefined, {
    message: 'Nothing to update.',
  });

// Duplicate IDs are dropped; 100 per request keeps one request's work bounded.
const fileIds = z
  .array(z.uuid('Invalid file ID.'))
  .min(1, 'Select at least one file.')
  .max(100, 'At most 100 files at a time.')
  .transform((ids) => [...new Set(ids)]);

// "action" decides which other fields are allowed: only "move" takes a folderId.
export const bulkBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('trash'), ids: fileIds }),
  z.strictObject({ action: z.literal('restore'), ids: fileIds }),
  z.strictObject({ action: z.literal('delete'), ids: fileIds }),
  z.strictObject({
    action: z.literal('move'),
    ids: fileIds,
    folderId: z.uuid('Invalid folder ID.').nullable(),
  }),
]);

// Multipart text fields arrive as strings; an empty folderId means "the root".
export const uploadBody = z.strictObject({
  folderId: z.preprocess(emptyToUndefined, z.uuid('Invalid folder ID.').optional()),
});
