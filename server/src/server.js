import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { startJobs } from './jobs/scheduler.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`CloudDrive API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Cleanup jobs (stale uploads, trash purge, temp files, old sessions).
const stopJobs = env.JOBS_ENABLED ? startJobs() : async () => {};

server.on('error', (err) => {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
});

/**
 * Graceful shutdown. When AWS ECS replaces a container (deploy, scale-in) it sends
 * SIGTERM. We stop accepting new connections, let in-flight requests (e.g. an upload)
 * finish, release resources, then exit. A timer forces exit if something hangs.
 */
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, 'Error while closing HTTP server');
    // Let a running cleanup job finish before the database goes away.
    await stopJobs();
    // Return database connections to PostgreSQL instead of dropping them.
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(err ? 1 : 0);
  });
  server.closeIdleConnections();
}

process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker / ECS stop

// A promise rejection nobody handled means the app is in an unknown state.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
