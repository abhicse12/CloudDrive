import { Router } from 'express';
import { healthRouter } from './health.routes.js';

// Every API route is mounted here, under /api (see app.js).
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
