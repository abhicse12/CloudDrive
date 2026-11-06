import { AppError } from '../utils/AppError.js';

/**
 * Allows only users with one of the given roles. Must run AFTER requireAuth.
 *   router.get('/admin/stats', requireAuth, requireRole('ADMIN'), handler)
 *
 * 401 = "we don't know who you are"; 403 = "we know who you are, and the answer is no".
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) throw AppError.unauthorized();
    if (!roles.includes(req.auth.role)) throw AppError.forbidden();
    next();
  };
}
