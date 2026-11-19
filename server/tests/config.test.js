import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { api } from './helpers/http.js';

const app = createApp();

describe('GET /api/config', () => {
  it('returns the public limits without login, and nothing secret', async () => {
    const res = await api(app).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
      maxFilesPerUpload: env.MAX_FILES_PER_UPLOAD,
      trashRetentionDays: env.TRASH_RETENTION_DAYS,
    });
  });
});
