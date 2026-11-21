import { storage } from '../storage/index.js';
import { AppError } from '../utils/AppError.js';
import { contentDisposition } from '../utils/contentDisposition.js';
import { inlineContentType, isInlineSafe } from '../utils/fileTypes.js';

/**
 * Security policy for file bytes, replacing helmet's page-oriented default.
 * Stricter overall: nothing may load or run (default-src 'none'). Allowed only:
 * our own images/media, and object-src 'self' because Chrome's built-in PDF viewer is
 * an embedded plugin that `object-src 'none'` would leave blank. Only our own pages
 * may embed the file (the preview modal). HTML/SVG never get here inline anyway.
 */
const FILE_CSP = [
  "default-src 'none'",
  "img-src 'self'",
  "media-src 'self'",
  "style-src 'unsafe-inline'",
  "object-src 'self'",
  "frame-ancestors 'self'",
].join('; ');

/**
 * GET /api/storage/:token - serves a file from a signed URL (local storage only).
 *
 * No login is needed here: the signature IS the permission, issued moments earlier by
 * an endpoint that did check login and ownership. Exactly how S3 pre-signed URLs work.
 */
export async function serveSignedFile(req, res) {
  const grant = storage.verifySignedToken(req.params.token);
  if (!grant) {
    throw new AppError(403, 'INVALID_SIGNED_URL', 'This link is invalid or has expired.');
  }

  // Defence in depth: even if a signed URL asked for "inline", only safe types display.
  const inline = grant.d === 'inline' && isInlineSafe(grant.t);

  res.set({
    'Content-Type': inline ? inlineContentType(grant.t) : grant.t || 'application/octet-stream',
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', grant.n),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': FILE_CSP,
  });

  // sendFile streams the file and supports HTTP Range requests, which is what lets a
  // video player jump to the middle without downloading everything first.
  await new Promise((resolve, reject) => {
    res.sendFile(
      grant.filePath,
      { cacheControl: false, etag: false, lastModified: false, dotfiles: 'deny' },
      (err) => {
        if (!err) return resolve();
        if (err.code === 'ENOENT' || err.status === 404) {
          return reject(AppError.notFound('This file no longer exists.'));
        }
        // Client went away mid-download (closed tab, seeked a video): not a server error.
        if (err.code === 'ECONNABORTED' || res.headersSent) return resolve();
        return reject(err);
      },
    );
  });
}
