import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { fileRepository, withShareState } from '../repositories/file.repository.js';
import { folderRepository } from '../repositories/folder.repository.js';
import { storage } from '../storage/index.js';
import { AppError } from '../utils/AppError.js';
import { isInlineSafe } from '../utils/fileTypes.js';
import { pageMeta, toSkipTake } from '../utils/pagination.js';
import { assertFolderOwned } from './folder.service.js';

const SORT_FIELDS = { name: 'originalName', size: 'sizeBytes', createdAt: 'createdAt' };

const fileNotFound = () => AppError.notFound('File not found.');

/** One activity entry per changed file. */
const events = (userId, action, files) =>
  files.map((file) => ({
    userId,
    action,
    targetType: 'FILE',
    targetId: file.id,
    metadata: { name: file.originalName },
  }));

/**
 * Signs a short-lived URL for a file the caller has ALREADY been allowed to read (owner
 * download or a valid share link). "inline" is downgraded to "attachment" for types that
 * aren't safe to display, so every way of reaching a file follows the same rule.
 */
export async function signedFileLink(file, disposition) {
  const effective =
    disposition === 'inline' && isInlineSafe(file.mimeType) ? 'inline' : 'attachment';
  const expiresIn = env.SIGNED_URL_TTL_SECONDS;
  const url = await storage.getSignedUrl(file.storageKey, {
    expiresIn,
    disposition: effective,
    filename: file.originalName,
    contentType: file.mimeType,
  });
  return { url, disposition: effective, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/** For single-file endpoints built on the bulk operations: nothing changed = 404. */
const exactlyOne = (count) => {
  if (count === 0) throw fileNotFound();
};

export const fileService = {
  /**
   * Lists files in one folder, or searches.
   *   no folderId         → the root, or EVERYWHERE when searching (like Drive's search box)
   *   folderId = "all"    → every folder
   *   folderId = <uuid>   → that folder only
   */
  async list(userId, query) {
    const { folderId, q, category, sortBy, sortOrder } = query;

    let scope;
    if (folderId === 'all' || (folderId === undefined && q)) scope = undefined;
    else if (folderId === undefined) scope = null;
    else {
      await assertFolderOwned(userId, folderId);
      scope = folderId;
    }

    const { files, total } = await fileRepository.list(userId, {
      folderId: scope,
      q,
      category,
      // id as a tie-breaker: rows with equal names/sizes keep a stable order, so the
      // same file never shows up on two pages (or on none).
      orderBy: [{ [SORT_FIELDS[sortBy]]: sortOrder }, { id: 'asc' }],
      ...toSkipTake(query),
    });
    return { files, meta: pageMeta(query, total) };
  },

  /** The file plus the path to its folder, for the details panel. */
  async get(userId, id) {
    const found = await fileRepository.findOwned(userId, id);
    if (!found) throw fileNotFound();
    const [file] = await withShareState([found]);
    const breadcrumbs = file.folderId
      ? await folderRepository.ancestors(userId, file.folderId)
      : [];
    return { file, breadcrumbs };
  },

  /**
   * A short-lived signed URL for the file's bytes. Ownership is checked HERE; the URL
   * itself then works without login, only for this file and only for a few minutes.
   */
  async downloadUrl(userId, id, { disposition }) {
    const file = await fileRepository.findOwned(userId, id);
    if (!file) throw fileNotFound();
    return signedFileLink(file, disposition);
  },

  /** Rename and/or move one file. Unlike folders, duplicate file names are allowed. */
  async update(userId, id, { name, folderId }) {
    const file = await fileRepository.findOwned(userId, id);
    if (!file) throw fileNotFound();

    const moving = folderId !== undefined && folderId !== file.folderId;
    const renaming = name !== undefined && name !== file.originalName;
    if (!moving && !renaming) return (await withShareState([file]))[0];
    if (moving) await assertFolderOwned(userId, folderId);

    const updated = await fileRepository.update(id, {
      ...(renaming && { originalName: name }),
      ...(moving && { folderId }),
    });
    await activityRepository.record({
      userId,
      action: moving ? 'FILE_MOVED' : 'FILE_RENAMED',
      targetType: 'FILE',
      targetId: id,
      metadata: {
        name: updated.originalName,
        ...(renaming && { previousName: file.originalName }),
      },
    });
    return (await withShareState([updated]))[0];
  },

  /*
   * Bulk operations. Each returns how many files it actually changed. IDs that don't
   * exist, belong to someone else, or are in the wrong state are silently skipped, so
   * the response never reveals anything about other users' files.
   */

  /** Soft delete. Trashed files still count toward the quota until deleted for good. */
  async trash(userId, ids) {
    return prisma.$transaction(async (tx) => {
      const files = await fileRepository.updateManyInState(
        userId,
        ids,
        'active',
        { deletedAt: new Date() },
        tx,
      );
      await activityRepository.recordMany(events(userId, 'FILE_TRASHED', files), tx);
      return files.length;
    });
  },

  async restore(userId, ids) {
    return prisma.$transaction(async (tx) => {
      const files = await fileRepository.updateManyInState(
        userId,
        ids,
        'trashed',
        { deletedAt: null },
        tx,
      );
      // Its folder is (still) in the trash: restore to the root rather than hide it.
      await fileRepository.detachFromTrashedFolders(
        files.map((f) => f.id),
        tx,
      );
      await activityRepository.recordMany(events(userId, 'FILE_RESTORED', files), tx);
      return files.length;
    });
  },

  async move(userId, ids, folderId) {
    await assertFolderOwned(userId, folderId);
    return prisma.$transaction(async (tx) => {
      const files = await fileRepository.updateManyInState(userId, ids, 'active', { folderId }, tx);
      await activityRepository.recordMany(events(userId, 'FILE_MOVED', files), tx);
      return files.length;
    });
  },

  /**
   * Permanent delete, only for files already in the trash.
   *
   * Order matters: bytes first, then the row. If deleting the bytes fails, nothing has
   * changed and the user can simply retry. (The other order could leave bytes in
   * storage that no row points to: invisible, unbillable, never cleaned up.)
   */
  async deletePermanently(userId, ids) {
    const files = await fileRepository.findManyOwned(userId, ids, 'trashed');
    let deleted = 0;
    for (const file of files) {
      await storage.delete(file.storageKey); // idempotent: fine if already gone
      deleted += await prisma.$transaction(async (tx) => {
        // 0 if a parallel request deleted it first: then don't release the quota twice.
        if ((await fileRepository.deleteOwned(userId, file.id, tx)) === 0) return 0;
        await fileRepository.releaseQuota(userId, file.sizeBytes, tx);
        await activityRepository.record(
          {
            userId,
            action: 'FILE_DELETED',
            targetType: 'FILE',
            targetId: file.id,
            metadata: { name: file.originalName, size: Number(file.sizeBytes) },
          },
          tx,
        );
        return 1;
      });
    }
    return deleted;
  },

  // Single-file versions, used by DELETE /:id, POST /:id/restore, DELETE /:id/permanent.
  async trashOne(userId, id) {
    exactlyOne(await this.trash(userId, [id]));
  },
  async restoreOne(userId, id) {
    exactlyOne(await this.restore(userId, [id]));
  },
  async deleteOne(userId, id) {
    exactlyOne(await this.deletePermanently(userId, [id]));
  },
};
