/**
 * How a file can be previewed in the browser, from its (server-detected) MIME type.
 * Mirrors the server's INLINE_SAFE list (server/src/utils/fileTypes.js): the server
 * refuses to serve anything else inline anyway, so the two must agree.
 * HTML, SVG and XML are deliberately missing: they could run scripts.
 */
const KINDS = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'],
  video: ['video/mp4', 'video/webm'],
  audio: [
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
  pdf: ['application/pdf'],
  text: [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/tab-separated-values',
    'application/json',
    'application/yaml',
  ],
};

const KIND_BY_TYPE = new Map(
  Object.entries(KINDS).flatMap(([kind, types]) => types.map((type) => [type, kind])),
);

/** 'image' | 'video' | 'audio' | 'pdf' | 'text' | null (download only) */
export const previewKind = (mimeType) => KIND_BY_TYPE.get(mimeType) ?? null;
