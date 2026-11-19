import { env } from '../config/env.js';
import { trashService } from '../services/trash.service.js';
import { toFileDto, toFolderDto } from '../utils/dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the automatic purge job will delete this item for good. */
const withPurgeDate = (dto) => ({
  ...dto,
  purgesAt: new Date(dto.deletedAt.getTime() + env.TRASH_RETENTION_DAYS * DAY_MS),
});

export const trashController = {
  async list(req, res) {
    const { folders, files, meta } = await trashService.list(req.auth.userId, req.validated.query);
    res.json({
      success: true,
      data: {
        folders: folders.map((folder) => withPurgeDate(toFolderDto(folder))),
        files: files.map((file) => withPurgeDate(toFileDto(file))),
        retentionDays: env.TRASH_RETENTION_DAYS,
      },
      meta,
    });
  },

  async empty(req, res) {
    const result = await trashService.empty(req.auth.userId);
    res.json({ success: true, data: result });
  },
};
