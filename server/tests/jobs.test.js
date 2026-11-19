import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { cleanupStaleUploads } from '../src/jobs/cleanupStaleUploads.js';
import { cleanupTempFiles } from '../src/jobs/cleanupTempFiles.js';
import { purgeAuthRecords } from '../src/jobs/purgeAuthRecords.js';
import { purgeTrash } from '../src/jobs/purgeTrash.js';
import { JOBS, startJobs } from '../src/jobs/scheduler.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { storage } from '../src/storage/index.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ago = (ms) => new Date(Date.now() - ms);
const later = (ms) => new Date(Date.now() + ms);

let alice;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const storageUsed = async () =>
  Number((await prisma.user.findUnique({ where: { id: alice.user.id } })).storageUsed);

/** A file row as the upload pipeline would leave it, with its quota reserved. */
async function pipelineRow({ status, createdAt, size = 100 }) {
  const id = randomUUID();
  const storageKey = `users/${alice.user.id}/${id}`;
  await prisma.file.create({
    data: {
      id,
      userId: alice.user.id,
      originalName: `${status}.bin`,
      storageKey,
      mimeType: 'application/pdf',
      category: 'DOCUMENT',
      sizeBytes: BigInt(size),
      status,
      createdAt,
    },
  });
  if (status === 'UPLOADING') {
    await prisma.user.update({
      where: { id: alice.user.id },
      data: { storageUsed: { increment: size } },
    });
  }
  return { id, storageKey };
}

describe('cleanupStaleUploads', () => {
  it('fails abandoned uploads, gives the quota back and removes them; leaves fresh ones', async () => {
    const stale = await pipelineRow({ status: 'UPLOADING', createdAt: ago(2 * HOUR_MS) });
    const fresh = await pipelineRow({ status: 'UPLOADING', createdAt: new Date() });

    const result = await cleanupStaleUploads();

    expect(result).toEqual({ markedFailed: 1, removed: 1 });
    expect(await prisma.file.findUnique({ where: { id: stale.id } })).toBeNull();
    expect((await prisma.file.findUnique({ where: { id: fresh.id } })).status).toBe('UPLOADING');
    expect(await storageUsed()).toBe(100); // only the fresh one's reservation remains
  });

  it('deletes stored bytes of old FAILED uploads without touching the quota again', async () => {
    const failed = await pipelineRow({ status: 'FAILED', createdAt: ago(2 * HOUR_MS) });
    const tmp = path.join(env.UPLOAD_TMP_DIR, randomUUID());
    await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
    await fs.writeFile(tmp, 'partial');
    await storage.upload({ key: failed.storageKey, sourcePath: tmp });

    await cleanupStaleUploads();

    expect(await storage.getMetadata(failed.storageKey)).toBeNull();
    expect(await prisma.file.count()).toBe(0);
    expect(await storageUsed()).toBe(0);
  });

  it('never touches files that are ACTIVE', async () => {
    const file = await uploadOne(alice, SAMPLES.png, 'a.png');

    await cleanupStaleUploads({ now: later(DAY_MS) });

    expect((await prisma.file.findUnique({ where: { id: file.id } })).status).toBe('ACTIVE');
  });
});

describe('purgeTrash', () => {
  async function trashSomething() {
    const docs = (await alice.post('/api/folders').send({ name: 'Docs' })).body.data.folder;
    await uploadOne(alice, SAMPLES.pdf, 'in-folder.pdf', { folderId: docs.id });
    const loose = await uploadOne(alice, SAMPLES.png, 'loose.png');
    await alice.delete(`/api/files/${loose.id}`);
    await alice.delete(`/api/folders/${docs.id}`);
  }

  it('keeps items younger than the retention period', async () => {
    await trashSomething();

    expect(await purgeTrash({ now: later(29 * DAY_MS) })).toEqual({ folders: 0, files: 0 });
    expect(await prisma.file.count()).toBe(2);
  });

  it('deletes items older than the retention period, through the normal delete path', async () => {
    await trashSomething();
    const active = await uploadOne(alice, SAMPLES.text, 'active.txt');

    const result = await purgeTrash({ now: later(31 * DAY_MS) });

    expect(result).toEqual({ folders: 1, files: 2 });
    expect(await prisma.folder.count()).toBe(0);
    expect((await prisma.file.findMany()).map((f) => f.id)).toEqual([active.id]);
    expect(await storageUsed()).toBe(SAMPLES.text.length);
    expect(await prisma.activityLog.count({ where: { action: 'FOLDER_DELETED' } })).toBe(1);
  });
});

describe('cleanupTempFiles', () => {
  it('removes only abandoned temp files', async () => {
    await fs.rm(env.UPLOAD_TMP_DIR, { recursive: true, force: true });
    await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
    const oldFile = path.join(env.UPLOAD_TMP_DIR, 'old');
    const newFile = path.join(env.UPLOAD_TMP_DIR, 'new');
    await fs.writeFile(oldFile, 'x');
    await fs.writeFile(newFile, 'x');
    const twoHoursAgo = ago(2 * HOUR_MS);
    await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);

    expect(await cleanupTempFiles()).toEqual({ removed: 1 });
    expect(await fs.readdir(env.UPLOAD_TMP_DIR)).toEqual(['new']);
  });
});

describe('purgeAuthRecords', () => {
  it('removes expired and long-revoked sessions and dead reset tokens', async () => {
    const session = (data) =>
      prisma.session.create({
        data: {
          userId: alice.user.id,
          refreshTokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
          expiresAt: later(DAY_MS),
          ...data,
        },
      });
    const expired = await session({ expiresAt: ago(1000) });
    const oldRevoked = await session({ revokedAt: ago(8 * DAY_MS) });
    const recentRevoked = await session({ revokedAt: ago(DAY_MS) });
    await prisma.passwordResetToken.create({
      data: { userId: alice.user.id, tokenHash: 'e'.repeat(64), expiresAt: ago(1000) },
    });

    const result = await purgeAuthRecords();

    expect(result).toEqual({ sessions: 2, resetTokens: 1 });
    const left = (await prisma.session.findMany()).map((s) => s.id);
    expect(left).toContain(recentRevoked.id);
    expect(left).not.toContain(expired.id);
    expect(left).not.toContain(oldRevoked.id);
    // Alice's real login session is untouched: she's still logged in.
    expect((await alice.get('/api/auth/me')).status).toBe(200);
  });
});

describe('scheduler', () => {
  it('keeps running the other jobs when one fails, and stops cleanly', async () => {
    const original = { ...JOBS };
    const calls = [];
    JOBS.cleanupStaleUploads = async () => {
      calls.push('a');
      throw new Error('boom');
    };
    JOBS.cleanupTempFiles = async () => calls.push('b');
    JOBS.purgeTrash = async () => calls.push('c');
    JOBS.purgeAuthRecords = async () => calls.push('d');

    try {
      const stop = startJobs({ firstRunMs: 1, intervalMs: 60 * 60 * 1000 });
      await vi.waitFor(() => expect(calls).toHaveLength(4));
      await stop();
      expect(calls).toEqual(['a', 'b', 'c', 'd']);
    } finally {
      Object.assign(JOBS, original);
    }
  });
});
