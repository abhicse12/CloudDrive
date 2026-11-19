import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { activityQuery, recentFilesQuery } from '../validators/dashboard.validators.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get('/stats', dashboardController.stats);
dashboardRouter.get(
  '/recent-files',
  validate({ query: recentFilesQuery }),
  dashboardController.recentFiles,
);
dashboardRouter.get('/activity', validate({ query: activityQuery }), dashboardController.activity);
