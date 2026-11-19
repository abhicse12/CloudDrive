import { Router } from 'express';
import { z } from 'zod';
import { trashController } from '../controllers/trash.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { paginationQuery } from '../utils/pagination.js';

export const trashRouter = Router();

trashRouter.use(requireAuth);

trashRouter.get(
  '/',
  validate({ query: z.strictObject({ ...paginationQuery }) }),
  trashController.list,
);
trashRouter.delete('/', trashController.empty);
