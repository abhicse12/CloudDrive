import { prisma } from '../../src/config/prisma.js';

/** Empties every table. Deleting users cascades to all other user-owned tables. */
export async function resetDb() {
  await prisma.$executeRaw`TRUNCATE TABLE users CASCADE`;
}
