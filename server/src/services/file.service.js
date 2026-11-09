import { fileRepository } from '../repositories/file.repository.js';
import { pageMeta, toSkipTake } from '../utils/pagination.js';
import { assertFolderOwned } from './folder.service.js';

const SORT_FIELDS = { name: 'originalName', size: 'sizeBytes', createdAt: 'createdAt' };

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
};
