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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: refusing to start is far better than running with broken config.
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const env = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';
