import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { env } from './env.js';

/**
 * The ONE database client for the whole app. It holds a connection pool, so creating
 * a client per request would quickly exhaust PostgreSQL's connection limit.
 *
 * Prisma 7 talks to PostgreSQL through the official `pg` driver ("driver adapter").
 * Pool size matters in AWS: (tasks × max) must stay below RDS max_connections.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({ adapter });
