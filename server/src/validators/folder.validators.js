import { z } from 'zod';
import { itemName, sortOrder } from './common.validators.js';

export const listFoldersQuery = z.strictObject({
  // Omitted = the root of "My Files".
  parentId: z.uuid('Invalid folder ID.').optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: sortOrder.default('asc'),
});

export const createFolderBody = z.strictObject({
  name: itemName,
  parentId: z.uuid('Invalid folder ID.').nullish(),
});

// Rename and/or move. parentId: null = move to root; omitted = don't move.
export const updateFolderBody = z
  .strictObject({
    name: itemName.optional(),
    parentId: z.uuid('Invalid folder ID.').nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.parentId !== undefined, {
    message: 'Nothing to update.',
  });
