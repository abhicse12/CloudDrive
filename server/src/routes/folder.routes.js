import { Router } from 'express';
import { folderController } from '../controllers/folder.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.validators.js';
import {
  createFolderBody,
  listFoldersQuery,
  updateFolderBody,
} from '../validators/folder.validators.js';

export const folderRouter = Router();

// Every folder route needs a logged-in user.
folderRouter.use(requireAuth);

folderRouter.get('/', validate({ query: listFoldersQuery }), folderController.list);
// Declared before "/:id" so "tree" is not mistaken for a folder ID.
folderRouter.get('/tree', folderController.tree);
folderRouter.post('/', validate({ body: createFolderBody }), folderController.create);
folderRouter.get('/:id', validate({ params: idParams }), folderController.get);
folderRouter.patch(
  '/:id',
  validate({ params: idParams, body: updateFolderBody }),
  folderController.update,
);
