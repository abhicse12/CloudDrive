import { Router } from 'express';
import { fileController } from '../controllers/file.controller.js';
import { shareController } from '../controllers/share.controller.js';
import { shareCreateLimiter, uploadLimiter } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { quotaPrecheck, receiveFiles } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.validators.js';
import {
  bulkBody,
  downloadQuery,
  listFilesQuery,
  updateFileBody,
} from '../validators/file.validators.js';
import { createShareBody } from '../validators/share.validators.js';

export const fileRouter = Router();

fileRouter.use(requireAuth);

const byId = validate({ params: idParams });

fileRouter.get('/', validate({ query: listFilesQuery }), fileController.list);

// Order matters: who are you → not too often → room for this much? → only THEN
// receive the bytes. Cheap checks first, so rejected requests cost us almost nothing.
fileRouter.post('/upload', uploadLimiter, quotaPrecheck, receiveFiles, fileController.upload);

fileRouter.post('/bulk', validate({ body: bulkBody }), fileController.bulk);

fileRouter.get('/:id', byId, fileController.get);
fileRouter.get(
  '/:id/download',
  validate({ params: idParams, query: downloadQuery }),
  fileController.download,
);
fileRouter.patch(
  '/:id',
  validate({ params: idParams, body: updateFileBody }),
  fileController.update,
);
fileRouter.delete('/:id', byId, fileController.trash);
fileRouter.post('/:id/restore', byId, fileController.restore);
fileRouter.delete('/:id/permanent', byId, fileController.deletePermanently);
fileRouter.post(
  '/:id/share',
  shareCreateLimiter,
  validate({ params: idParams, body: createShareBody }),
  shareController.create,
);
