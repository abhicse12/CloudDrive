import { existsSync } from 'node:fs';
import { z } from 'zod';

// Locally, settings come from server/.env. In AWS, the platform (ECS + Secrets Manager)
// injects real environment variables and there is no .env file at all.
// Tests skip the file so they can never accidentally point at the development database.
const envFile = new URL('../../.env', import.meta.url);
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgresql:// connection URL',
  }),

  // Comma-separated list of browser origins allowed to call the API.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Number of proxies in front of the app (0 locally, 1 behind an AWS ALB).
  // Needed so req.ip is the real client IP, which rate limiting depends on.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // ─── Authentication ───
  // Signs access tokens. Anyone who knows it can forge logins, so: long, random, secret.
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900), // 15 minutes
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  // bcrypt work factor: each +1 doubles hashing time (12 ≈ 0.25-0.8 s depending on CPU).
  // Slow on purpose: makes guessing passwords from a leaked database impractical.
  // Tests use 4 for speed.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Secure cookies are only sent over HTTPS. Must be true in production.
  COOKIE_SECURE: z.stringbool().default(false),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

  // ─── Frontend / email ───
  // Public URL of the web app, used to build links inside emails (e.g. password reset).
  APP_URL: z.url().default('http://localhost:5173'),
  // "console" prints emails to the server log. "ses" (AWS) is added in Phase 8.
  EMAIL_PROVIDER: z.enum(['console']).default('console'),

  // ─── Storage ───
  DEFAULT_STORAGE_LIMIT_BYTES: z.coerce.bigint().positive().default(5_368_709_120n), // 5 GiB
});

const parsed = envSchema
  .refine((cfg) => cfg.NODE_ENV !== 'production' || cfg.COOKIE_SECURE, {
    path: ['COOKIE_SECURE'],
    message: 'must be true in production (cookies would otherwise travel over plain HTTP)',
  })
  .refine((cfg) => cfg.NODE_ENV !== 'production' || cfg.BCRYPT_ROUNDS >= 12, {
    path: ['BCRYPT_ROUNDS'],
    message: 'must be at least 12 in production',
  })
  .safeParse(process.env);

if (!parsed.success) {
  // Fail fast: refusing to start is far better than running with broken config.
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';
