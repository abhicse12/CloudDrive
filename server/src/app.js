import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { apiRouter } from './routes/index.js';

/**
 * Builds the Express app without starting it. server.js calls listen();
 * tests pass the app straight to Supertest, so no real port is needed.
 *
 * Middleware runs top to bottom for every request, so ORDER MATTERS.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by'); // don't advertise "Express" to attackers
  // No ETags: they let the browser revalidate and get "304, use your cached copy",
  // which is wrong for live, personal API data (see Cache-Control: no-store below).
  app.set('etag', false);
  app.set('trust proxy', env.TRUST_PROXY);

  // 1. Tag the request, then log it (the logger reuses the ID).
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      // Log only what's useful for debugging, not every header.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Load balancers call health checks every few seconds; don't flood production logs.
      autoLogging: { ignore: (req) => isProduction && req.url.startsWith('/api/health') },
    }),
  );

  // 2. Security headers (CSP, HSTS, no-sniff, frame protection, ...).
  app.use(helmet());

  // 3. Only listed browser origins may call the API with cookies.
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  // 4. Read the Cookie header into req.cookies (auth tokens + CSRF token live there).
  app.use(cookieParser());

  // 5. Reject cross-site forged requests BEFORE doing any work on them.
  app.use('/api', csrfProtection);

  // 6. Parse JSON bodies. Small limit: files go through multipart uploads, not JSON.
  app.use(express.json({ limit: '100kb' }));

  // 7. API responses are live, often personal data (e.g. /auth/me): never let the
  //    browser or any proxy store them. Also stops 304 "use your cached copy" replies.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // 8. Routes.
  app.use('/api', apiRouter);

  // 9. Nothing matched → 404. Any error → standard JSON error. Must be last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
