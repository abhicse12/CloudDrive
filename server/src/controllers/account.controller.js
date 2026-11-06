import { accountService } from '../services/account.service.js';
import { toUserDto } from '../utils/dto.js';

export const accountController = {
  async updateProfile(req, res) {
    const user = await accountService.updateProfile(req.auth.userId, req.validated.body);
    res.json({ success: true, data: { user: toUserDto(user) } });
  },

  async changePassword(req, res) {
    await accountService.changePassword(req.user, req.auth.sessionId, req.validated.body);
    res.status(204).end();
  },

  forgotPassword(req, res) {
    accountService.requestPasswordReset(req.validated.body.email);
    // 202 Accepted: "we got it and will handle it", identical for every email.
    res.status(202).json({
      success: true,
      data: { message: 'If an account exists for this email, a reset link has been sent.' },
    });
  },

  async resetPassword(req, res) {
    await accountService.resetPassword(req.validated.body);
    res.status(204).end();
  },
};
