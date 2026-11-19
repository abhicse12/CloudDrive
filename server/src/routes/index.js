import { Router } from 'express';
import { env } from '../config/env.js';
import { authRouter } from './auth.routes.js';
import { fileRouter } from './file.routes.js';
import { folderRouter } from './folder.routes.js';
import { healthRouter } from './health.routes.js';
import { storageRouter } from './storage.routes.js';
import { trashRouter } from './trash.routes.js';

// Every API route is mounted here, under /api (see app.js).
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/folders', folderRouter);
apiRouter.use('/files', fileRouter);
apiRouter.use('/trash', trashRouter);
if (env.STORAGE_DRIVER === 'local') apiRouter.use('/storage', storageRouter);
