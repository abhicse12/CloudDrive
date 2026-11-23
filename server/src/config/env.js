import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Locally, settings come from server/.env. In AWS, the platform (ECS + Secrets Manager)
// injects real environment variables and there is no .env file at all.
// Tests skip the file so they can never accidentally point at the development database.
const envFile = new URL('../../.env', import.meta.url);
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** A directory setting: relative values are resolved against the server/ folder. */
const serverPath = z
  .string()
  .min(1)
  .transform((value) => path.resolve(SERVER_ROOT, value));

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
  // "console" prints emails to the server log (development only; refused in production).
  // "ses" (AWS) is added in Phase 8.
  EMAIL_PROVIDER: z.enum(['console']).default('console'),

  // ─── Storage ───
  DEFAULT_STORAGE_LIMIT_BYTES: z.coerce.bigint().positive().default(5_368_709_120n), // 5 GiB
  // "local" keeps files on this machine's disk. "s3" (AWS) is added in Phase 8.
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  // Relative paths are resolved from the server/ folder, not from wherever npm was run.
  // prefault (not default): the default must also go through serverPath's transform.
  STORAGE_LOCAL_ROOT: serverPath.prefault('./storage-data'),
  UPLOAD_TMP_DIR: serverPath.prefault('./tmp-uploads'),
  // Signs download links. Separate from JWT_ACCESS_SECRET: one leaked secret must not
  // compromise both logins and file access.
  STORAGE_SIGNING_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300), // 5 minutes

  // ─── Uploads ───
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(5120).default(100),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().min(1).max(100).default(20),

  // ─── Background jobs ───
  TRASH_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  JOBS_ENABLED: z.stringbool().default(true),
});

// Rules that only apply in production, where a mistake would be a security hole.
const productionSchema = envSchema
  .refine((cfg) => cfg.NODE_ENV !== 'production' || cfg.COOKIE_SECURE, {
    path: ['COOKIE_SECURE'],
    message: 'must be true in production (cookies would otherwise travel over plain HTTP)',
  })
  .refine((cfg) => cfg.NODE_ENV !== 'production' || cfg.BCRYPT_ROUNDS >= 12, {
    path: ['BCRYPT_ROUNDS'],
    message: 'must be at least 12 in production',
  })
  .refine((cfg) => cfg.NODE_ENV !== 'production' || cfg.EMAIL_PROVIDER !== 'console', {
    path: ['EMAIL_PROVIDER'],
    message:
      'must not be "console" in production: it writes emails, including password reset links, to the logs',
  });

/**
 * Validates a set of variables (normally process.env). Exported so tests can check the
 * production rules with plain objects, without starting a process or reading any file.
 * Fail fast: refusing to start is far better than running with broken config.
 */
export function parseEnv(source) {
  const parsed = productionSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return Object.freeze(parsed.data);
}

export const env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
