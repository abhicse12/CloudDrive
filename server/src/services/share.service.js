import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { fileRepository } from '../repositories/file.repository.js';
import { shareRepository } from '../repositories/share.repository.js';
import { AppError } from '../utils/AppError.js';
import { shareStatus } from '../utils/dto.js';
import { pageMeta, toSkipTake } from '../utils/pagination.js';
import { generateOpaqueToken, hashToken } from './token.service.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EXPIRES_IN_MS = { '1h': HOUR_MS, '1d': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS };

const shareNotFound = () => AppError.notFound('Share link not found.');

/** The public page for a token. The token lives in the path, never in a query string. */
const shareUrl = (token) => `${env.APP_URL.replace(/\/+$/, '')}/s/${token}`;

/**
 * A fresh random token and its hash. Only the hash is stored; the token goes back to
 * the owner exactly once, inside the create/regenerate response.
 */
function newToken() {
  const token = generateOpaqueToken();
  return { token, tokenHash: hashToken(token) };
}

const event = (userId, action, share, metadata) => ({
  userId,
  action,
  targetType: 'SHARE',
  targetId: share.id,
  metadata: { name: share.file.originalName, fileId: share.fileId, ...metadata },
});

export const shareService = {
  /**
   * Creates a share link for one of the user's active (not trashed) files.
   *
   * If the file is trashed a moment after the check below, the share is still created,
   * but harmlessly: public access re-checks the file's state on every request.
   */
  async create(userId, fileId, { expiresIn }) {
    const file = await fileRepository.findOwned(userId, fileId);
    if (!file) throw AppError.notFound('File not found.');

    const { token, tokenHash } = newToken();
    const ms = EXPIRES_IN_MS[expiresIn]; // undefined for "never"
    const expiresAt = ms ? new Date(Date.now() + ms) : null;

    return prisma.$transaction(async (tx) => {
      const share = await shareRepository.create({ fileId, tokenHash, expiresAt }, tx);
      await activityRepository.record(event(userId, 'SHARE_CREATED', share, { expiresAt }), tx);
      return { share, url: shareUrl(token) };
    });
  },

  async list(userId, query) {
    const { shares, total } = await shareRepository.list(userId, {
      status: query.status,
      ...toSkipTake(query),
    });
    return { shares, meta: pageMeta(query, total) };
  },

  async get(userId, id) {
    const share = await shareRepository.findOwned(userId, id);
    if (!share) throw shareNotFound();
    return share;
  },

  /**
   * Revoking is idempotent: revoking an already revoked link succeeds and changes
   * nothing (its original revokedAt and the single activity entry are kept).
   */
  async revoke(userId, id) {
    const share = await this.get(userId, id);
    if (share.revokedAt) return;

    await prisma.$transaction(async (tx) => {
      // 0 = a parallel request revoked it first; it already logged the event.
      if ((await shareRepository.revoke(userId, id, tx)) === 0) return;
      await activityRepository.record(event(userId, 'SHARE_REVOKED', share), tx);
    });
  },

  /**
   * "The link leaked, give me a new one": revokes the old link and creates a new one for
   * the same file with the SAME expiry date, in one transaction. Only active links can
   * be regenerated; an expired or revoked link means "make a new share" instead.
   *
   * The conditional revoke is the race guard: if two regenerate requests overlap, only
   * one of them can revoke the old link, so only one new link is ever created.
   */
  async regenerate(userId, id) {
    const share = await this.get(userId, id);
    const notActive = () =>
      new AppError(
        409,
        'SHARE_NOT_ACTIVE',
        'Only active links can be regenerated. Create a new share link instead.',
      );
    if (shareStatus(share) !== 'active' || share.file.deletedAt) throw notActive();

    const { token, tokenHash } = newToken();
    return prisma.$transaction(async (tx) => {
      if ((await shareRepository.revoke(userId, id, tx)) === 0) throw notActive();
      const next = await shareRepository.create(
        { fileId: share.fileId, tokenHash, expiresAt: share.expiresAt },
        tx,
      );
      await activityRepository.recordMany(
        [
          event(userId, 'SHARE_REVOKED', share, { regenerated: true }),
          event(userId, 'SHARE_CREATED', next, {
            expiresAt: next.expiresAt,
            regeneratedFrom: share.id,
          }),
        ],
        tx,
      );
      return { share: next, url: shareUrl(token) };
    });
  },
};
