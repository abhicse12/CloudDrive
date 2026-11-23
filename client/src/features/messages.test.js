import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeActivity } from './dashboard/describeActivity.js';
import { describeUploadError } from './uploads/uploadErrors.js';

describe('upload error messages', () => {
  const limits = { maxFileSizeBytes: 100 * 1024 * 1024 };

  it.each([
    ['QUOTA_EXCEEDED', 'Not enough storage space.'],
    ['FILE_TOO_LARGE', 'Larger than the 100 MB limit.'],
    ['UNSUPPORTED_FILE_TYPE', "This file type isn't supported."],
    ['NOT_FOUND', 'The destination folder no longer exists.'],
    ['NETWORK_ERROR', 'Connection lost. Check your internet and try again.'],
  ])('%s → %s', (code, message) => {
    expect(describeUploadError({ code, message: 'server text' }, limits)).toBe(message);
  });

  it("falls back to the server's own message for anything else", () => {
    expect(describeUploadError({ code: 'WHATEVER', message: 'Server says no.' }, limits)).toBe(
      'Server says no.',
    );
  });
});

describe('activity feed', () => {
  /**
   * Contract with the server: every ActivityAction in the database schema must have a
   * sentence here. Otherwise a new action shows up in the feed as plain "Activity".
   */
  it('has a sentence for every action the server can log', () => {
    const schema = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../server/prisma/schema.prisma'),
      'utf8',
    );
    const block = schema.match(/enum ActivityAction \{([^}]*)\}/)[1];
    const actions = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[A-Z_]+$/.test(line));

    expect(actions.length).toBeGreaterThan(10);
    for (const action of actions) {
      expect({
        action,
        text: describeActivity({ action, metadata: { name: 'x' } }).text,
      }).not.toEqual({ action, text: 'Activity' });
    }
  });

  it('uses the names saved at the time', () => {
    expect(
      describeActivity({
        action: 'FILE_RENAMED',
        metadata: { name: 'b.png', previousName: 'a.png' },
      }).text,
    ).toBe('Renamed “a.png” to “b.png”');
    expect(
      describeActivity({
        action: 'FOLDER_RESTORED',
        metadata: { name: 'Docs (restored)', previousName: 'Docs' },
      }).text,
    ).toBe('Restored folder “Docs” as “Docs (restored)”');
    expect(describeActivity({ action: 'FILE_MOVED', metadata: {} }).text).toBe('Moved an item');
  });

  it('degrades gracefully for an action it does not know', () => {
    expect(describeActivity({ action: 'SOMETHING_NEW' }).text).toBe('Activity');
  });
});
