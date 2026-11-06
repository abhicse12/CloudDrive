import { AppError } from '../utils/AppError.js';

// Reached only when no route matched the request.
export function notFound(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found.`));
}
