import { activityRepository } from '../repositories/activity.repository.js';
import { folderRepository } from '../repositories/folder.repository.js';
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
};
