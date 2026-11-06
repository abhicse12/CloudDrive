import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';

export const healthRouter = Router();

// Liveness: "is the process up?" Deliberately checks nothing else, so a database
// outage doesn't make the load balancer think the app itself needs restarting.
healthRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

// Readiness: "can this instance serve real traffic right now?" An AWS ALB stops routing
// requests to an instance whose readiness check fails, until it passes again.
// (A storage check is added in Phase 5, when the storage provider exists.)
healthRouter.get('/ready', async (req, res) => {
  const checks = { database: await checkDatabase(req.log) };
  const ready = Object.values(checks).every((check) => check.status === 'ok');

  if (!ready) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Service is not ready.', { checks });
  }

  res.json({ success: true, data: { status: 'ready', checks } });
});

async function checkDatabase(log) {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (err) {
    // Details go to the logs only; the public response just says "error".
    log.error({ err }, 'Readiness check: database unreachable');
    return { status: 'error' };
  }
}
