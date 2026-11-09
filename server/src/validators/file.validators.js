import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';
import { sortOrder } from './common.validators.js';

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

// Multipart text fields arrive as strings; an empty folderId means "the root".
export const uploadBody = z.strictObject({
  folderId: z.preprocess(emptyToUndefined, z.uuid('Invalid folder ID.').optional()),
});
