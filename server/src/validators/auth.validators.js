import { z } from 'zod';

// Trimmed and lower-cased BEFORE the email check, so " Me@X.com " becomes "me@x.com".
const email = z
  .string('Email is required.')
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

const name = z
  .string('Name is required.')
  .trim()
  .min(1, 'Name is required.')
  .max(100, 'Name must be at most 100 characters.');

/**
 * Password rules for NEW passwords. Following current NIST guidance: a minimum length,
 * no forced "must contain a symbol" rules. bcrypt only reads the first 72 BYTES, so
 * longer passwords are rejected rather than silently truncated (emoji count as 4 bytes).
 */
export const newPassword = z
  .string('Password is required.')
  .min(8, 'Password must be at least 8 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.');

// strictObject rejects unknown fields. Without it, a request like
// { ..., "role": "ADMIN" } might one day reach the database ("mass assignment").
export const registerSchema = z.strictObject({
  name,
  email,
  password: newPassword,
});

// No strength rules for EXISTING passwords: just reject empty and absurdly large input.
const existingPassword = z
  .string('Password is required.')
  .min(1, 'Password is required.')
  .max(1024);

export const loginSchema = z.strictObject({
  email,
  password: existingPassword,
});

export const updateProfileSchema = z.strictObject({ name });

export const changePasswordSchema = z
  .strictObject({
    currentPassword: existingPassword,
    newPassword,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one.',
  });

export const forgotPasswordSchema = z.strictObject({ email });

export const resetPasswordSchema = z.strictObject({
  // Same format as generateOpaqueToken(): 43 base64url characters.
  token: z.string().regex(/^[\w-]{43}$/, 'This reset link is invalid.'),
  newPassword,
});
