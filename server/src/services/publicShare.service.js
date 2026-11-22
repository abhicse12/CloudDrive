import { shareRepository } from '../repositories/share.repository.js';
import { AppError } from '../utils/AppError.js';
import { isInlineSafe } from '../utils/fileTypes.js';
import { signedFileLink } from './file.service.js';
import { hashToken } from './token.service.js';

// Tokens are 32 random bytes in base64url: always exactly 43 URL-safe characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * ONE error for every way a link can fail: unknown, malformed, revoked, expired, file
 * in trash or deleted, owner suspended. Different answers would tell an attacker which
 * links once existed, or that a person's account was suspended.
 */
const linkNotFound = () =>
  AppError.notFound('This link is invalid, has expired, or is no longer shared.');

/**
 * Anyone with the link may use it, so there is no user here: the token IS the permission.
 * Malformed tokens are rejected without touching the database.
 */
async function findWorkingShare(token) {
  if (!TOKEN_PATTERN.test(token)) throw linkNotFound();
  const share = await shareRepository.findPublic(hashToken(token));
  if (!share) throw linkNotFound();
  return share;
}

export const publicShareService = {
  /**
   * What a visitor may know about a shared file, and nothing more: no IDs, no owner,
   * no folder. Looking at the page does not count as an access.
   */
  async describe(token) {
    const { file, expiresAt } = await findWorkingShare(token);
    return {
      fileName: file.originalName,
      size: Number(file.sizeBytes),
      mimeType: file.mimeType,
      category: file.category,
      expiresAt,
      // The page offers "Open" only when the browser may display the file itself.
      canPreview: isInlineSafe(file.mimeType),
    };
  },

  /**
   * A short-lived signed URL for the bytes. Downloading AND opening inline both count:
   * either way the file left our servers.
   */
  async downloadUrl(token, { disposition }) {
    const share = await findWorkingShare(token);
    await shareRepository.recordAccess(share.id);
    return signedFileLink(share.file, disposition);
  },
};
