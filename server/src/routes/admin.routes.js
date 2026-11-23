import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { listUsersQuery, updateUserBody } from '../validators/admin.validators.js';
import { idParams } from '../validators/common.validators.js';

// Every admin route: logged in (401 otherwise) AND role ADMIN (403 otherwise).
// The role comes from the database on each request (requireAuth), not from the JWT,
// so a demoted admin loses access immediately.
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/stats', adminController.stats);
adminRouter.get('/users', validate({ query: listUsersQuery }), adminController.listUsers);
adminRouter.patch(
  '/users/:id',
  validate({ params: idParams, body: updateUserBody }),
  adminController.updateUser,
);
