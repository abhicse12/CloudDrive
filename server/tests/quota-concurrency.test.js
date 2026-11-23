/**
 * Quota under real concurrency. Every test FORCES the overlap: all requests are held
 * just before they reserve space and released together, so they really compete for the
 * same free bytes (a plain Promise.all can pass by luck when requests run one by one).
 *
 * Invariants checked after every scenario:
 *   1. storage_used never exceeds storage_limit;
 *   2. storage_used == the sum of the user's stored (ACTIVE, incl. trashed) files,
 *      i.e. no reservation leaked and nothing was released twice.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { resetRateLimits } from '../src/middleware/rateLimits.js';
import { fileRepository } from '../src/repositories/file.repository.js';
import { storage } from '../src/storage/index.js';
import { resetDb } from './helpers/db.js';
import { SAMPLES, upload, uploadOne } from './helpers/files.js';
import { loginAsNewUser } from './helpers/users.js';

const app = createApp();
const SIZE = SAMPLES.png.length;

let alice;

beforeEach(async () => {
  await resetDb();
  await resetRateLimits();
  alice = await loginAsNewUser(app, { name: 'Alice' });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

const setLimit = (bytes) =>
  prisma.user.update({ where: { id: alice.user.id }, data: { storageLimit: BigInt(bytes) } });

/** Both invariants, straight from the database. */
async function expectQuotaConsistent() {
  const user = await prisma.user.findUnique({ where: { id: alice.user.id } });
  const stored = await prisma.file.aggregate({
    where: { userId: alice.user.id, status: { in: ['ACTIVE', 'UPLOADING'] } },
    _sum: { sizeBytes: true },
  });
  expect(user.storageUsed).toBeLessThanOrEqual(user.storageLimit);
  expect(user.storageUsed).toBe(stored._sum.sizeBytes ?? 0n);
  return Number(user.storageUsed);
}

/**
 * Holds every call of `object[method]` until `count` calls are waiting, then lets them
 * all run at once. The wait happens BEFORE the real call, so no database lock is held
 * while waiting (no deadlock). A timeout keeps a broken test from hanging forever.
 */
function holdUntil(object, method, count) {
  const real = object[method].bind(object);
  let waiting = 0;
  let release;
  const allHere = new Promise((resolve) => (release = resolve));
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`only ${waiting}/${count} calls arrived`)), 5000),
  );
  vi.spyOn(object, method).mockImplementation(async (...args) => {
    waiting += 1;
    if (waiting === count) release();
    await Promise.race([allHere, timeout]);
    return real(...args);
  });
  return () => waiting;
}

describe('parallel uploads with forced overlap', () => {
  it('8 single-file uploads for room for 3: exactly 3 stored, 5 refused, quota exact', async () => {
    await setLimit(SIZE * 3);
    const PARALLEL = 8;
    holdUntil(fileRepository, 'reserveQuota', PARALLEL);

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) =>
        upload(alice, [{ content: SAMPLES.png, name: `p${i}.png` }]),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 413)).toHaveLength(5);
    expect(
      results.filter((r) => r.status === 413).every((r) => r.body.error.code === 'QUOTA_EXCEEDED'),
    ).toBe(true);
    expect(await expectQuotaConsistent()).toBe(SIZE * 3);
    expect(await prisma.file.count({ where: { userId: alice.user.id, status: 'ACTIVE' } })).toBe(3);
  });

  it('multi-file requests in parallel share the space correctly', async () => {
    await setLimit(SIZE * 4);
    // 2 requests × 3 files; files inside one request go one after another, so the first
    // reservation of each request is what overlaps.
    holdUntil(fileRepository, 'reserveQuota', 2);
    const files = (tag) => [0, 1, 2].map((i) => ({ content: SAMPLES.png, name: `${tag}${i}.png` }));

    const results = await Promise.all([upload(alice, files('a')), upload(alice, files('b'))]);

    const uploaded = results.flatMap((r) => r.body.data?.uploaded ?? []);
    const failed = results.flatMap((r) => r.body.data?.failed ?? r.body.error?.details ?? []);
    expect(uploaded).toHaveLength(4);
    expect(failed).toHaveLength(2);
    expect(await expectQuotaConsistent()).toBe(SIZE * 4);
  });

  it('a storage failure in the middle of the race gives its space back', async () => {
    await setLimit(SIZE * 3);
    holdUntil(fileRepository, 'reserveQuota', 4);
    vi.spyOn(storage, 'upload').mockRejectedValueOnce(new Error('disk full'));

    const results = await Promise.all(
      [0, 1, 2, 3].map((i) => upload(alice, [{ content: SAMPLES.png, name: `f${i}.png` }])),
    );

    const statuses = results.map((r) => r.status);
    const stored = statuses.filter((s) => s === 201).length;
    // One upload failed to store (500) and gave its space back. Whether the last request
    // still got that space depends on timing (both outcomes are correct):
    //   [201, 201, 413, 500]  the release came after the 4th reservation
    //   [201, 201, 201, 500]  the 4th reserved the space that was just released
    expect(statuses.filter((s) => s === 500)).toHaveLength(1);
    expect([2, 3]).toContain(stored);
    expect(statuses.filter((s) => s === 413)).toHaveLength(3 - stored);
    expect(await expectQuotaConsistent()).toBe(SIZE * stored);
    expect(await prisma.file.count({ where: { status: 'FAILED' } })).toBe(1);
  });
});

describe('releasing space concurrently', () => {
  it('two parallel "delete forever" of the same file release its space once', async () => {
    const file = await uploadOne(alice, SAMPLES.pdf, 'a.pdf');
    await uploadOne(alice, SAMPLES.png, 'keep.png');
    await alice.delete(`/api/files/${file.id}`);
    // Both requests find the file and delete its bytes before either removes the row.
    holdUntil(storage, 'delete', 2);

    const results = await Promise.all([
      alice.delete(`/api/files/${file.id}/permanent`),
      alice.delete(`/api/files/${file.id}/permanent`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 404]);
    expect(await expectQuotaConsistent()).toBe(SIZE);
  });

  it('emptying the trash twice at once releases each file once', async () => {
    for (const name of ['a.png', 'b.png', 'c.png']) {
      const file = await uploadOne(alice, SAMPLES.png, name);
      await alice.delete(`/api/files/${file.id}`);
    }
    await uploadOne(alice, SAMPLES.pdf, 'keep.pdf');
    holdUntil(storage, 'delete', 2);

    const results = await Promise.all([alice.delete('/api/trash'), alice.delete('/api/trash')]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    const freed = results.reduce((sum, r) => sum + r.body.data.files, 0);
    expect(freed).toBe(3);
    expect(await expectQuotaConsistent()).toBe(SAMPLES.pdf.length);
  });

  it('upload and delete racing each other keep the books balanced', async () => {
    await setLimit(SIZE * 2);
    const old = await uploadOne(alice, SAMPLES.png, 'old.png');
    await uploadOne(alice, SAMPLES.png, 'other.png'); // now full
    await alice.delete(`/api/files/${old.id}`);

    // Deleting frees one slot while two new uploads want it.
    const results = await Promise.all([
      alice.delete(`/api/files/${old.id}/permanent`),
      upload(alice, [{ content: SAMPLES.png, name: 'n1.png' }]),
      upload(alice, [{ content: SAMPLES.png, name: 'n2.png' }]),
    ]);

    expect(results[0].status).toBe(204);
    // At most one upload fits (maybe none, if both reserved before the delete).
    expect(results.slice(1).filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    expect(await expectQuotaConsistent()).toBeLessThanOrEqual(SIZE * 2);
  });
});
