import { Router } from 'express';
import { publicShareController } from '../controllers/publicShare.controller.js';
import { publicDownloadLimiter, publicShareLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { publicDownloadQuery, publicShareParams } from '../validators/share.validators.js';

/**
 * Routes that work WITHOUT login. Everything here is reachable by anyone on the internet,
 * so each route is rate limited per IP and returns as little as possible.
 */
export const publicRouter = Router();

publicRouter.use((_req, res, next) => {
  res.set({
    // The token is in the URL: never send it to another site in a Referer header.
    'Referrer-Policy': 'no-referrer',
    // Shared files are private by default: keep them out of search engines.
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});

publicRouter.get(
  '/shares/:token',
  publicShareLimiter,
  validate({ params: publicShareParams }),
  publicShareController.describe,
);
publicRouter.get(
  '/shares/:token/download',
  publicDownloadLimiter,
  validate({ params: publicShareParams, query: publicDownloadQuery }),
  publicShareController.download,
);
