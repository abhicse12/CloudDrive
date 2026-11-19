import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { fileService } from '../services/file.service.js';
import { folderService } from '../services/folder.service.js';
import { AppError } from '../utils/AppError.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

/**
 * Permanently deletes anything that has been in the trash longer than
 * TRASH_RETENTION_DAYS. It reuses the same service code as the "Delete forever" button,
 * so the rules (bytes first, quota released once, activity logged) are identical.
 */
export async function purgeTrash({
  now = new Date(),
  retentionDays = env.TRASH_RETENTION_DAYS,
} = {}) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  let folders = 0;
  let files = 0;

  // Folders first: deleting one also deletes the files and subfolders inside it.
  const oldFolders = await prisma.folder.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, userId: true },
    orderBy: { deletedAt: 'asc' },
    take: BATCH,
  });
  for (const folder of oldFolders) {
    try {
      const result = await folderService.deletePermanently(folder.userId, folder.id);
      folders += 1;
      files += result.files;
    } catch (err) {
      // 404: already removed with its parent earlier in this loop. 409: upload in
      // progress inside it; try again next run. Anything else: log and keep going, so
      // one broken item can't block everyone else's purge.
      if (err instanceof AppError && [404, 409].includes(err.statusCode)) continue;
      logger.error({ err, folderId: folder.id }, 'Trash purge failed for a folder');
    }
  }

  const oldFiles = await prisma.file.findMany({
    where: { status: 'ACTIVE', deletedAt: { lt: cutoff } },
    select: { id: true, userId: true },
    take: BATCH * 5,
  });
  const byUser = Map.groupBy(oldFiles, (file) => file.userId);
  for (const [userId, userFiles] of byUser) {
    try {
      files += await fileService.deletePermanently(
        userId,
        userFiles.map((file) => file.id),
      );
    } catch (err) {
      logger.error({ err, userId }, 'Trash purge failed for files');
    }
  }

  return { folders, files };
}
