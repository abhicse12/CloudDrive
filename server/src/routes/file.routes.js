import { Router } from 'express';
import { fileController } from '../controllers/file.controller.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { quotaPrecheck, receiveFiles } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { listFilesQuery } from '../validators/file.validators.js';

export const fileRouter = Router();

fileRouter.use(requireAuth);

fileRouter.get('/', validate({ query: listFilesQuery }), fileController.list);

// Order matters: who are you → not too often → room for this much? → only THEN
// receive the bytes. Cheap checks first, so rejected requests cost us almost nothing.
fileRouter.post('/upload', uploadLimiter, quotaPrecheck, receiveFiles, fileController.upload);
