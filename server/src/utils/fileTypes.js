/**
 * Which files CloudDrive accepts, how they are categorised, and which may be shown
 * inside the browser. One place for these rules, so upload, download and stats agree.
 *
 * MIME types here are what we DETECT from the file's bytes, never what the browser claims.
 */

/** Binary formats, recognised by their "magic bytes" (see services/upload.service.js). */
const BINARY_TYPES = {
  IMAGE: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
  ],
  VIDEO: [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/x-msvideo',
    'video/mpeg',
  ],
  AUDIO: [
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/flac',
    'audio/x-flac',
    'audio/aac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/webm',
  ],
  DOCUMENT: [
    'application/pdf',
    'application/rtf',
    'application/epub+zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
  ],
  ARCHIVE: [
    'application/zip',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',
    'application/vnd.rar',
    'application/x-rar-compressed',
  ],
};

/**
 * Old Office files (.doc/.xls/.ppt) share one container format, detected only as
 * "application/x-cfb". It is accepted only with one of these extensions.
 */
export const LEGACY_OFFICE = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
};

/**
 * Text formats have no magic bytes, so they're accepted by extension, and only if the
 * content really looks like text (checked during upload).
 */
export const TEXT_TYPES = {
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
};

const CATEGORY_BY_MIME = new Map(
  Object.entries(BINARY_TYPES).flatMap(([category, types]) => types.map((t) => [t, category])),
);

export function isAllowedBinaryType(mimeType) {
  return CATEGORY_BY_MIME.has(mimeType);
}

/** IMAGE | VIDEO | AUDIO | DOCUMENT | ARCHIVE | OTHER */
export function categoryOf(mimeType) {
  if (CATEGORY_BY_MIME.has(mimeType)) return CATEGORY_BY_MIME.get(mimeType);
  if (mimeType === 'image/svg+xml') return 'IMAGE';
  if (mimeType.startsWith('text/') || mimeType.startsWith('application/')) return 'DOCUMENT';
  return 'OTHER';
}

/**
 * Types the browser may display inline (preview). Everything else is always downloaded.
 *
 * HTML, SVG and XML are deliberately NOT here: opened inline on our domain, a malicious
 * one could run JavaScript as if it were CloudDrive (stored XSS) and act as the user.
 * Text types are safe because we send them as text/plain with X-Content-Type-Options:
 * nosniff, so the browser never interprets them as a page.
 */
const INLINE_SAFE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/yaml',
]);

export function isInlineSafe(mimeType) {
  return INLINE_SAFE.has(mimeType);
}

/**
 * Content-Type to SEND for inline display. Text formats go out as text/plain so the
 * browser shows them as plain text instead of trying to run or render them.
 */
export function inlineContentType(mimeType) {
  if (mimeType.startsWith('text/') || mimeType.startsWith('application/json')) {
    return 'text/plain; charset=utf-8';
  }
  if (mimeType === 'application/yaml') return 'text/plain; charset=utf-8';
  return mimeType;
}
