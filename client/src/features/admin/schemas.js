import { z } from 'zod';
import { MAX_LIMIT_GB } from './adminFormat.js';

/** The edit-user form. The limit is typed in GB; the dialog converts it to bytes. */
export const editUserSchema = z.object({
  // Optional: when admins edit themselves these fields aren't part of the form at all.
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  // An empty field reaches us as NaN (valueAsNumber), which z.number() rejects.
  storageLimitGb: z
    .number('Enter a size in GB.')
    .min(0, 'The limit cannot be negative.')
    .max(MAX_LIMIT_GB, 'That limit is too large.'),
});
