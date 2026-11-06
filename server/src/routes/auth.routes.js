import { Router } from 'express';
import { accountController } from '../controllers/account.controller.js';
import { authController } from '../controllers/auth.controller.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import {
  changePasswordLimiter,
  forgotPasswordLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  refreshLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth.validators.js';

export const authRouter = Router();

// Rate limiters run BEFORE validation and password hashing, so blocked requests
// cost the server almost nothing.

// ─── Session ───
authRouter.get('/csrf', issueCsrfToken);
authRouter.post(
  '/register',
  registerLimiter,
  validate({ body: registerSchema }),
  authController.register,
);
authRouter.post(
  '/login',
  loginIpLimiter,
  loginAccountLimiter,
  validate({ body: loginSchema }),
  authController.login,
);
authRouter.post('/refresh', refreshLimiter, authController.refresh);
// Logout works even with an expired access token: it uses the refresh cookie.
authRouter.post('/logout', authController.logout);

// ─── Current user ───
authRouter.get('/me', requireAuth, authController.me);
authRouter.patch(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  accountController.updateProfile,
);
authRouter.post(
  '/change-password',
  requireAuth,
  changePasswordLimiter,
  validate({ body: changePasswordSchema }),
  accountController.changePassword,
);

// ─── Password reset (logged out) ───
authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: forgotPasswordSchema }),
  accountController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  resetPasswordLimiter,
  validate({ body: resetPasswordSchema }),
  accountController.resetPassword,
);
