import { Router } from 'express';
import { env } from '../config/env.js';

export const configRouter = Router();

const MB = 1024 * 1024;

/**
 * Public limits the frontend needs, so it never hard-codes them: the upload dialog
 * can refuse a too-big file instantly instead of after uploading 100 MB of it.
 * Only limits go here, never secrets. The server still enforces every one of them.
 */
configRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      maxFileSizeBytes: env.MAX_FILE_SIZE_MB * MB,
      maxFilesPerUpload: env.MAX_FILES_PER_UPLOAD,
      trashRetentionDays: env.TRASH_RETENTION_DAYS,
    },
  });
});
