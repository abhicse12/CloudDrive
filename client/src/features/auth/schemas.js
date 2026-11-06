import { z } from 'zod';

/*
 * Form validation rules. They MIRROR server/src/validators/auth.validators.js so users
 * get instant feedback. They are a convenience only: the server re-validates everything,
 * because anyone can bypass browser code. Keep both files in sync when rules change.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  // bcrypt reads only the first 72 bytes; emoji/accented letters take several bytes each.
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.'),
});

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be at most 100 characters.'),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ newPassword });
