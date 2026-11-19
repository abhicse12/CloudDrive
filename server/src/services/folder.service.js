import { prisma } from '../config/prisma.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { fileRepository } from '../repositories/file.repository.js';
import { folderRepository } from '../repositories/folder.repository.js';
import { storage } from '../storage/index.js';
import { AppError } from '../utils/AppError.js';

const folderNotFound = () => AppError.notFound('Folder not found.');

const nameTaken = () =>
  new AppError(409, 'FOLDER_NAME_TAKEN', 'A folder with this name already exists here.', [
    { field: 'name', message: 'A folder with this name already exists here.' },
  ]);

/**
 * The database's unique index (same name + same parent, case-insensitive) is the real
 * guard against duplicates; checking first would race with a parallel request.
 * Here we only translate its error into a friendly 409.
 */
async function withNameCheck(operation) {
  try {
    return await operation();
  } catch (err) {
    if (err.code === 'P2002') throw nameTaken();
    throw err;
  }
}

/**
 * Confirms a destination folder exists, is active, and belongs to the user.
 * null means "the root", which always exists.
 */
export async function assertFolderOwned(userId, folderId, db) {
  if (folderId === null || folderId === undefined) return null;
  const folder = await folderRepository.findOwned(userId, folderId, db);
  if (!folder) throw AppError.notFound('Destination folder not found.');
  return folder;
}

export const folderService = {
  async list(userId, { parentId, sortBy, sortOrder }) {
    // Listing a missing/foreign parent must fail, not quietly return nothing.
    await assertFolderOwned(userId, parentId);
    return folderRepository.listChildren(userId, parentId, { [sortBy]: sortOrder });
  },

  listTree(userId) {
    return folderRepository.listTree(userId);
  },

  async get(userId, id) {
    const folder = await folderRepository.findOwned(userId, id);
    if (!folder) throw folderNotFound();
    const breadcrumbs = await folderRepository.ancestors(userId, id);
    return { folder, breadcrumbs };
  },

  async create(userId, { name, parentId = null }) {
    await assertFolderOwned(userId, parentId);
    const folder = await withNameCheck(() => folderRepository.create({ userId, name, parentId }));
    await activityRepository.record({
      userId,
      action: 'FOLDER_CREATED',
      targetType: 'FOLDER',
      targetId: folder.id,
      metadata: { name },
    });
    return folder;
  },

  /** Rename and/or move. */
  async update(userId, id, { name, parentId }) {
    const folder = await folderRepository.findOwned(userId, id);
    if (!folder) throw folderNotFound();

    const moving = parentId !== undefined && parentId !== folder.parentId;
    if (moving) {
      await assertFolderOwned(userId, parentId);
      if (parentId !== null) {
        // A folder can't go inside itself or anything below it: that would create a
        // loop (A → B → A) and make the whole branch unreachable.
        const subtree = await folderRepository.subtreeIds(userId, id);
        if (subtree.includes(parentId)) {
          throw new AppError(400, 'INVALID_MOVE', 'A folder cannot be moved into itself.');
        }
      }
    }

    const renaming = name !== undefined && name !== folder.name;
    if (!moving && !renaming) return folder;

    const updated = await withNameCheck(() =>
      folderRepository.update(id, {
        ...(renaming && { name }),
        ...(moving && { parentId }),
      }),
    );

    await activityRepository.record({
      userId,
      action: moving ? 'FOLDER_MOVED' : 'FOLDER_RENAMED',
      targetType: 'FOLDER',
      targetId: id,
      metadata: { name: updated.name, ...(renaming && { previousName: folder.name }) },
    });
    return updated;
  },

  /**
   * Moves the folder and everything inside it to the trash, in one transaction, all
   * stamped with the SAME deletedAt. That shared timestamp is what restore uses to tell
   * "trashed together with this folder" from "was already in the trash before".
   */
  async trash(userId, id) {
    const folder = await folderRepository.findOwned(userId, id);
    if (!folder) throw folderNotFound();

    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const ids = await folderRepository.subtreeIds(userId, id, tx);
      await folderRepository.setSubtreeDeletedAt(ids, { from: null, to: deletedAt }, tx);
      await activityRepository.record(
        {
          userId,
          action: 'FOLDER_TRASHED',
          targetType: 'FOLDER',
          targetId: id,
          metadata: { name: folder.name },
        },
        tx,
      );
    });
  },

  /**
   * Brings back the folder and whatever was trashed WITH it (same deletedAt).
   * - Its parent is gone or in the trash → it comes back at the root.
   * - Its name is now taken there → "Name (restored)", "Name (restored 2)", ...
   */
  async restore(userId, id) {
    const folder = await folderRepository.findOwnedTrashed(userId, id);
    if (!folder) throw folderNotFound();
    const trashedAt = folder.deletedAt;

    return withNameCheck(() =>
      prisma.$transaction(async (tx) => {
        const parentActive =
          folder.parentId && (await folderRepository.findOwned(userId, folder.parentId, tx));
        const parentId = parentActive ? folder.parentId : null;
        const name = await freeName(userId, parentId, folder.name, tx);

        // Place it first (while still trashed, so it can't clash), then un-trash.
        await tx.folder.update({ where: { id }, data: { parentId, name } });
        const ids = await folderRepository.subtreeIds(userId, id, tx);
        await folderRepository.setSubtreeDeletedAt(ids, { from: trashedAt, to: null }, tx);

        await activityRepository.record(
          {
            userId,
            action: 'FOLDER_RESTORED',
            targetType: 'FOLDER',
            targetId: id,
            metadata: { name, ...(name !== folder.name && { previousName: folder.name }) },
          },
          tx,
        );
        return tx.folder.findUnique({ where: { id } });
      }),
    );
  },

  /**
   * Deletes a trashed folder for good: every file's bytes, every file row, every
   * subfolder. Same order as for files: bytes first, so a failure part-way leaves
   * rows that a retry can finish, never bytes that nothing points to.
   * Returns { files, bytes } freed.
   */
  async deletePermanently(userId, id) {
    const folder = await folderRepository.findOwnedTrashed(userId, id);
    if (!folder) throw folderNotFound();

    const folderIds = await folderRepository.subtreeIds(userId, id);
    const files = await fileRepository.findInFolders(userId, folderIds);
    if (files.some((file) => file.status === 'UPLOADING')) {
      throw new AppError(409, 'UPLOAD_IN_PROGRESS', 'Wait for uploads in this folder to finish.');
    }

    for (const file of files) await storage.delete(file.storageKey);

    return prisma.$transaction(async (tx) => {
      const deleted = files.length
        ? await fileRepository.deleteManyReturning(
            userId,
            files.map((file) => file.id),
            tx,
          )
        : [];
      // FAILED uploads already gave their bytes back.
      const bytes = deleted
        .filter((row) => row.status !== 'FAILED')
        .reduce((sum, row) => sum + BigInt(row.sizeBytes), 0n);
      if (bytes > 0n) await fileRepository.releaseQuota(userId, bytes, tx);

      // 0 = a parallel request already deleted it; report nothing freed twice.
      if ((await folderRepository.deleteOwned(userId, id, tx)) === 0) throw folderNotFound();
      await activityRepository.record(
        {
          userId,
          action: 'FOLDER_DELETED',
          targetType: 'FOLDER',
          targetId: id,
          metadata: { name: folder.name, files: deleted.length, size: Number(bytes) },
        },
        tx,
      );
      return { files: deleted.length, bytes: Number(bytes) };
    });
  },
};

/** "Photos" → "Photos (restored)" → "Photos (restored 2)" ... until it's free. */
async function freeName(userId, parentId, name, db) {
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const suffix =
      attempt === 1 ? '' : attempt === 2 ? ' (restored)' : ` (restored ${attempt - 1})`;
    const candidate = name.slice(0, 255 - suffix.length) + suffix;
    if (!(await folderRepository.nameTaken(userId, parentId, candidate, db))) return candidate;
  }
  throw nameTaken();
}
