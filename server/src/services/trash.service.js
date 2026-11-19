import { fileRepository } from '../repositories/file.repository.js';
import { folderRepository } from '../repositories/folder.repository.js';
import { AppError } from '../utils/AppError.js';
import { pageMeta, toSkipTake } from '../utils/pagination.js';
import { fileService } from './file.service.js';
import { folderService } from './folder.service.js';

const BULK_LIMIT = 100;

export const trashService = {
  /**
   * The trash page: only TOP-LEVEL items. A file trashed together with its folder shows
   * up inside that folder (when restored), not as a separate row here.
   * Folders are few, so they come in full; files are paginated.
   */
  async list(userId, query) {
    const [folders, { files, total }] = await Promise.all([
      folderRepository.listTrashedTopLevel(userId),
      fileRepository.listTrashedTopLevel(userId, toSkipTake(query)),
    ]);
    return { folders, files, meta: pageMeta(query, total) };
  },

  /** "Empty trash": deletes every trashed folder (with contents) and file, for good. */
  async empty(userId) {
    let folders = 0;
    let files = 0;

    for (const folder of await folderRepository.listTrashedTopLevel(userId)) {
      try {
        const result = await folderService.deletePermanently(userId, folder.id);
        folders += 1;
        files += result.files;
      } catch (err) {
        // Already deleted by a parallel request: nothing left to do for this one.
        if (err instanceof AppError && err.statusCode === 404) continue;
        throw err;
      }
    }

    // Whatever is left: trashed files at the root or in folders that aren't trashed.
    const ids = await fileRepository.trashedIds(userId);
    for (let i = 0; i < ids.length; i += BULK_LIMIT) {
      files += await fileService.deletePermanently(userId, ids.slice(i, i + BULK_LIMIT));
    }
    return { folders, files };
  },
};
