import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const MB = 1024 * 1024;

// Multipart framing (boundaries, part headers) adds a little to Content-Length on top
// of the file bytes. Allow for it so a file that exactly fits isn't refused early.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Cheap early refusal: if the whole request is clearly bigger than the user's free
 * space, say so BEFORE receiving (possibly) gigabytes. Just an optimisation: the real
 * guarantee is the atomic reservation in the upload service, since Content-Length can
 * be missing or wrong.
 */
export function quotaPrecheck(req, _res, next) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength)) {
    const free = req.user.storageLimit - req.user.storageUsed;
    if (BigInt(Math.max(0, contentLength - MULTIPART_OVERHEAD_BYTES)) > free) {
      throw new AppError(413, 'QUOTA_EXCEEDED', 'Not enough storage space for this upload.');
    }
  }
  next();
}

const multerUpload = multer({
  // Stream each file straight to a temp file on disk, never into memory, so a 100 MB
  // upload costs ~0 RAM. The temp name is random: the user's filename is never a path.
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true }, (err) => cb(err, env.UPLOAD_TMP_DIR));
    },
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * MB,
    files: env.MAX_FILES_PER_UPLOAD,
    fields: 5,
    fieldSize: 1024,
    fieldNameSize: 100,
  },
  // Browsers send filenames as UTF-8. Multer's default (latin1) would turn
  // "café.png" into "cafÃ©.png".
  defParamCharset: 'utf8',
});

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: () =>
    new AppError(413, 'FILE_TOO_LARGE', `Each file can be at most ${env.MAX_FILE_SIZE_MB} MB.`),
  LIMIT_FILE_COUNT: () => tooManyFiles(),
  // Also raised when a file comes in under any field name other than "files".
  LIMIT_UNEXPECTED_FILE: () => tooManyFiles(),
};

const tooManyFiles = () =>
  new AppError(
    400,
    'TOO_MANY_FILES',
    `Send at most ${env.MAX_FILES_PER_UPLOAD} files per upload, in the "files" field.`,
  );

/**
 * Receives up to MAX_FILES_PER_UPLOAD files from the "files" field into req.files.
 * On any error Multer deletes the temp files it already wrote.
 */
export function receiveFiles(req, res, next) {
  multerUpload.array('files', env.MAX_FILES_PER_UPLOAD)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const toAppError = MULTER_ERRORS[err.code];
      return next(
        toAppError ? toAppError() : new AppError(400, 'INVALID_UPLOAD', 'Invalid upload request.'),
      );
    }
    // e.g. the client aborted, or a malformed multipart body
    if (err.message?.includes('Unexpected end of form') || err.message?.includes('Malformed')) {
      return next(new AppError(400, 'INVALID_UPLOAD', 'The upload was incomplete or malformed.'));
    }
    return next(err);
  });
}
