import { Router } from 'express';
import { serveSignedFile } from '../controllers/storage.controller.js';

// Only mounted when STORAGE_DRIVER=local. With S3, browsers download straight from S3.
export const storageRouter = Router();

storageRouter.get('/:token', serveSignedFile);
