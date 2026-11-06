import { isProduction } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Converts known non-AppError errors (from libraries) into AppErrors.
function toAppError(err) {
  if (err instanceof AppError) return err;

  // Errors raised by express.json() while reading the request body
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }

  return null;
}

/**
 * The single place where errors become HTTP responses. Express 5 forwards both thrown
 * errors and rejected promises from async handlers here automatically.
 * Express recognises an error handler by its 4 parameters, so `next` must stay.
 */
export function errorHandler(err, req, res, next) {
  // If the response already started streaming, we can't send JSON any more;
  // Express's default handler closes the connection.
  if (res.headersSent) return next(err);

  const appError = toAppError(err);

  if (!appError) {
    // Unexpected error = a bug. Log everything, reveal nothing.
    req.log.error({ err }, 'Unhandled error');
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again later.',
        ...(!isProduction && { stack: err.stack }),
      },
      requestId: req.id,
    });
  }

  return res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
    },
    requestId: req.id,
  });
}
