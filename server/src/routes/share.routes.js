import { Router } from 'express';
import { shareController } from '../controllers/share.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.validators.js';
import { listSharesQuery } from '../validators/share.validators.js';

// The owner's view of their share links. Creating one lives on the file:
// POST /api/files/:id/share (see file.routes.js).
export const shareRouter = Router();

shareRouter.use(requireAuth);

const byId = validate({ params: idParams });

shareRouter.get('/', validate({ query: listSharesQuery }), shareController.list);
shareRouter.get('/:id', byId, shareController.get);
shareRouter.delete('/:id', byId, shareController.revoke);
shareRouter.post('/:id/regenerate', byId, shareController.regenerate);
