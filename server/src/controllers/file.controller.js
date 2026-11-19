import { parseInput } from '../middleware/validate.js';
import { fileService } from '../services/file.service.js';
import { removeTempFiles, uploadService } from '../services/upload.service.js';
import { AppError } from '../utils/AppError.js';
import { toFileDto } from '../utils/dto.js';
import { uploadBody } from '../validators/file.validators.js';

const toFailureDto = ({ name, error }) => ({
  name,
  error: { code: error.code, message: error.message },
});

export const fileController = {
  async list(req, res) {
    const { files, meta } = await fileService.list(req.auth.userId, req.validated.query);
    res.json({ success: true, data: { files: files.map(toFileDto) }, meta });
  },

  async get(req, res) {
    const { file, breadcrumbs } = await fileService.get(req.auth.userId, req.validated.params.id);
    res.json({ success: true, data: { file: toFileDto(file), breadcrumbs } });
  },

  async download(req, res) {
    const { redirect, ...options } = req.validated.query;
    const link = await fileService.downloadUrl(req.auth.userId, req.validated.params.id, options);
    if (redirect) return res.redirect(302, link.url);
    res.json({ success: true, data: link });
  },

  async update(req, res) {
    const file = await fileService.update(
      req.auth.userId,
      req.validated.params.id,
      req.validated.body,
    );
    res.json({ success: true, data: { file: toFileDto(file) } });
  },

  async trash(req, res) {
    await fileService.trashOne(req.auth.userId, req.validated.params.id);
    res.status(204).end();
  },

  async restore(req, res) {
    await fileService.restoreOne(req.auth.userId, req.validated.params.id);
    res.status(204).end();
  },

  async deletePermanently(req, res) {
    await fileService.deleteOne(req.auth.userId, req.validated.params.id);
    res.status(204).end();
  },

  async bulk(req, res) {
    const { action, ids, folderId } = req.validated.body;
    const userId = req.auth.userId;
    const run = {
      trash: () => fileService.trash(userId, ids),
      restore: () => fileService.restore(userId, ids),
      delete: () => fileService.deletePermanently(userId, ids),
      move: () => fileService.move(userId, ids, folderId),
    };
    const affected = await run[action]();
    res.json({ success: true, data: { action, requested: ids.length, affected } });
  },

  /**
   * Status code:
   *   201 if at least one file was stored (the body lists failures, if any).
   *   If none were: the shared error's status (413 quota, 415 type...) when every file
   *   failed for the same reason, otherwise 400 UPLOAD_REJECTED. Either way `details`
   *   says what happened to each file.
   */
  async upload(req, res) {
    const files = req.files ?? [];
    try {
      const body = parseInput(uploadBody, req.body);
      const { uploaded, failed } = await uploadService.uploadFiles(req.auth.userId, body, files);

      if (uploaded.length > 0) {
        return res.status(201).json({
          success: true,
          data: { uploaded: uploaded.map(toFileDto), failed: failed.map(toFailureDto) },
        });
      }

      const details = failed.map(({ name, error }) => ({ field: name, message: error.message }));
      const codes = new Set(failed.map(({ error }) => error.code));
      if (codes.size === 1) {
        const [{ error }] = failed;
        throw new AppError(error.statusCode, error.code, error.message, details);
      }
      throw new AppError(400, 'UPLOAD_REJECTED', 'None of the files could be uploaded.', details);
    } finally {
      // Whatever happened (validation error, 404 folder...), never leave temp files.
      await removeTempFiles(files);
    }
  },
};
