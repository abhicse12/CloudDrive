import { AppError } from '../utils/AppError.js';

/**
 * Validates request input against Zod schemas before the controller runs.
 *   router.post('/x', validate({ body: schema, query: schema, params: schema }), handler)
 *
 * Parsed (trimmed, lower-cased, type-converted) values are put on `req.validated`.
 * Controllers read ONLY from req.validated, so unvalidated input never reaches services.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Some of the submitted data is invalid.',
          result.error.issues.map((issue) => ({
            field: issue.path.join('.') || (issue.keys ? issue.keys.join(', ') : part),
            message: issue.message,
          })),
        );
      }
      req.validated[part] = result.data;
    }

    next();
  };
}
