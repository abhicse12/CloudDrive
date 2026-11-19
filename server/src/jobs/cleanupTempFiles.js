import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Deletes Multer temp files left behind (e.g. the server crashed mid-upload). The
 * request handler normally removes them; this is the safety net. A file still being
 * written keeps getting a fresh modified-time, so only abandoned ones are old.
 */
export async function cleanupTempFiles({ now = new Date(), maxAgeMs = HOUR_MS } = {}) {
  let entries;
  try {
    entries = await fs.readdir(env.UPLOAD_TMP_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { removed: 0 };
    throw err;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(env.UPLOAD_TMP_DIR, entry.name);
    try {
      const { mtimeMs } = await fs.stat(fullPath);
      if (now.getTime() - mtimeMs < maxAgeMs) continue;
      await fs.rm(fullPath, { force: true });
      removed += 1;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; // removed by its request meanwhile: fine
    }
  }
  return { removed };
}
