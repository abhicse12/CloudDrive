import { z } from 'zod';

/** Same rules as the server's itemName, so most mistakes are caught before sending. */
export const itemNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(255, 'Name must be at most 255 characters.')
  .refine((value) => !/[/\\]/.test(value), 'Name cannot contain / or \\.')
  .refine((value) => value !== '.' && value !== '..', 'This name is not allowed.');

export const nameFormSchema = z.object({ name: itemNameSchema });
