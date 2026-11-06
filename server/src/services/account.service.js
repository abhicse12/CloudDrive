import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { emailProvider } from '../email/index.js';
import { passwordResetEmail } from '../email/templates.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { passwordResetRepository } from '../repositories/passwordReset.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/AppError.js';
import { generateOpaqueToken, hashToken } from './token.service.js';

const invalidResetLink = () =>
  new AppError(
    400,
    'INVALID_RESET_TOKEN',
    'This reset link is invalid or has expired. Please request a new one.',
  );

/** Creates a reset token and emails the link. Runs in the background (see below). */
async function sendPasswordResetEmail(email) {
  const user = await userRepository.findByEmail(email);
  if (!user || user.status !== 'ACTIVE') return;

  // Only the newest link should work: requesting twice invalidates the first email.
  await passwordResetRepository.invalidateAllForUser(user.id);

  const token = generateOpaqueToken();
  await passwordResetRepository.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
  });

  const resetUrl = new URL('/reset-password', env.APP_URL);
  resetUrl.searchParams.set('token', token);

  await emailProvider.send({
    to: user.email,
    ...passwordResetEmail({
      name: user.name,
      resetUrl: resetUrl.toString(),
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    }),
  });
}

export const accountService = {
  updateProfile(userId, { name }) {
    return userRepository.update(userId, { name });
  },

  /**
   * Changing the password logs out every OTHER device: if someone else knew the old
   * password and is logged in somewhere, they're kicked out. This device stays logged in.
   */
  async changePassword(user, sessionId, { currentPassword, newPassword }) {
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      // 400, not 401: a 401 would make the frontend think the SESSION expired.
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.', [
        { field: 'currentPassword', message: 'Current password is incorrect.' },
      ]);
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await userRepository.update(user.id, { passwordHash }, tx);
      await sessionRepository.revokeAllForUser(user.id, { exceptSessionId: sessionId }, tx);
      await passwordResetRepository.invalidateAllForUser(user.id, tx);
      await activityRepository.record(
        { userId: user.id, action: 'PASSWORD_CHANGED', targetType: 'ACCOUNT', targetId: user.id },
        tx,
      );
    });
  },

  /**
   * Always "succeeds" from the caller's point of view, whether or not the email exists,
   * so the endpoint can't be used to find out who has an account.
   * The real work runs in the background: if we awaited it, a registered email would
   * respond measurably slower (database writes + email) than an unknown one.
   */
  requestPasswordReset(email) {
    sendPasswordResetEmail(email).catch((err) =>
      logger.error({ err }, 'Failed to process password reset request'),
    );
  },

  /**
   * Sets a new password from a reset link. Everything happens in ONE transaction:
   * either the password changes AND the token is used up AND all sessions end,
   * or nothing changes at all.
   */
  async resetPassword({ token, newPassword }) {
    const tokenHash = hashToken(token);
    // Hash before the transaction: bcrypt is slow and transactions should be short.
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      const resetToken = await passwordResetRepository.findByTokenHash(tokenHash, tx);
      if (!resetToken) throw invalidResetLink();

      // Atomic "use once": fails if already used, expired, or used concurrently.
      const consumed = await passwordResetRepository.consume(tokenHash, tx);
      if (!consumed) throw invalidResetLink();

      const user = await userRepository.update(resetToken.userId, { passwordHash }, tx);
      if (user.status !== 'ACTIVE') throw invalidResetLink();

      // Whoever might have had access is logged out everywhere.
      await sessionRepository.revokeAllForUser(user.id, {}, tx);
      await passwordResetRepository.invalidateAllForUser(user.id, tx);
      await activityRepository.record(
        {
          userId: user.id,
          action: 'PASSWORD_CHANGED',
          targetType: 'ACCOUNT',
          targetId: user.id,
          metadata: { via: 'reset-link' },
        },
        tx,
      );
    });
  },
};
