import { prisma } from '../config/prisma.js';
import { fileRepository } from '../repositories/file.repository.js';
import { storage } from '../storage/index.js';

const HOUR_MS = 60 * 60 * 1000;
const BATCH = 500;

/**
 * Repairs uploads that never finished (server crash, killed container...).
 *
 * Phase 1: UPLOADING rows older than an hour → FAILED, and their reserved quota is
 *          given back. Conditional update: if the row changed meanwhile, skip it.
 * Phase 2: FAILED rows older than an hour → delete their bytes (if any were stored),
 *          then the row. Bytes first, as everywhere: a failure leaves a row to retry.
 */
export async function cleanupStaleUploads({ now = new Date(), maxAgeMs = HOUR_MS } = {}) {
  const cutoff = new Date(now.getTime() - maxAgeMs);

  const stale = await prisma.file.findMany({
    where: { status: 'UPLOADING', createdAt: { lt: cutoff } },
    select: { id: true, userId: true, sizeBytes: true },
    take: BATCH,
  });
  let failed = 0;
  for (const file of stale) {
    failed += await prisma.$transaction(async (tx) => {
      const { count } = await tx.file.updateMany({
        where: { id: file.id, status: 'UPLOADING' },
        data: { status: 'FAILED' },
      });
      if (count === 1) await fileRepository.releaseQuota(file.userId, file.sizeBytes, tx);
      return count;
    });
  }

  const dead = await prisma.file.findMany({
    where: { status: 'FAILED', createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: BATCH,
  });
  for (const file of dead) {
    await storage.delete(file.storageKey);
    await prisma.file.deleteMany({ where: { id: file.id, status: 'FAILED' } });
  }

  return { markedFailed: failed, removed: dead.length };
}
