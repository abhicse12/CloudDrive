import { logger } from '../config/logger.js';
import { cleanupStaleUploads } from './cleanupStaleUploads.js';
import { cleanupTempFiles } from './cleanupTempFiles.js';
import { purgeAuthRecords } from './purgeAuthRecords.js';
import { purgeTrash } from './purgeTrash.js';

const MINUTE_MS = 60 * 1000;

export const JOBS = {
  cleanupStaleUploads,
  cleanupTempFiles,
  purgeTrash,
  purgeAuthRecords,
};

/**
 * Runs every job now and then, inside the API process (a simple in-process timer).
 *
 * Fine for one server. With several (AWS Auto Scaling) every instance would run them;
 * they're written to be safe if that happens (conditional updates, idempotent deletes),
 * but in Phase 8 they move to ONE scheduled task (EventBridge → ECS task / Lambda).
 */
export function startJobs({ intervalMs = 15 * MINUTE_MS, firstRunMs = MINUTE_MS } = {}) {
  let current = null;

  async function runAll() {
    for (const [name, job] of Object.entries(JOBS)) {
      const started = Date.now();
      try {
        const result = await job();
        logger.info({ job: name, result, ms: Date.now() - started }, 'Job finished');
      } catch (err) {
        // One failing job must not stop the others, or the timer.
        logger.error({ err, job: name }, 'Job failed');
      }
    }
  }

  function tick() {
    if (current) return; // previous run still going: skip rather than pile up
    current = runAll().finally(() => {
      current = null;
    });
  }

  // unref: these timers alone don't keep the process alive (clean shutdown).
  const first = setTimeout(tick, firstRunMs).unref();
  const timer = setInterval(tick, intervalMs).unref();
  logger.info({ intervalMs }, 'Background jobs scheduled');

  /** Stops the timers and waits for a run in progress to finish (graceful shutdown). */
  return async function stop() {
    clearTimeout(first);
    clearInterval(timer);
    await current;
  };
}
