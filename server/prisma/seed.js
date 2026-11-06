/**
 * Creates (or promotes) the first ADMIN user. Run with: npm run db:seed -w server
 *
 * Reads ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD from server/.env.
 * Safe to run repeatedly ("idempotent"): if the user already exists it is made an
 * active ADMIN, and its password is NOT changed.
 */
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import { logger } from '../src/config/logger.js';
import { prisma } from '../src/config/prisma.js';
import { newPassword } from '../src/validators/auth.validators.js';

const adminSchema = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  ADMIN_NAME: z.string().trim().min(1).max(100).default('Administrator'),
  ADMIN_PASSWORD: newPassword,
});

async function main() {
  const parsed = adminSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Cannot seed admin user:\n${z.prettifyError(parsed.error)}`);
  }
  const { ADMIN_EMAIL: email, ADMIN_NAME: name, ADMIN_PASSWORD: password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', status: 'ACTIVE' },
    });
    logger.info(`Admin ready: ${email} already existed - ensured role ADMIN (password unchanged).`);
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
      storageLimit: env.DEFAULT_STORAGE_LIMIT_BYTES,
    },
  });
  logger.info(`Admin created: ${email}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
