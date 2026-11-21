import { describe, expect, it } from 'vitest';
import { describeActivity } from '../features/dashboard/describeActivity.js';
import { formatRelative } from './format.js';

const NOW = new Date('2026-11-22T12:00:00Z');
const at = (seconds) => new Date(NOW.getTime() + seconds * 1000);
const DAY = 24 * 3600;

describe('formatRelative', () => {
  it.each([
    [at(-20), 'just now'],
    [at(-5 * 60), '5 minutes ago'],
    [at(-3 * 3600), '3 hours ago'],
    [at(-DAY), 'yesterday'],
    [at(-3 * DAY), '3 days ago'],
    [at(27 * DAY), 'in 4 weeks'],
    [at(2 * DAY), 'in 2 days'],
    [at(-400 * DAY), 'last year'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelative(date, NOW)).toBe(expected);
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatRelative('not a date', NOW)).toBe('');
  });
});

describe('describeActivity', () => {
  it.each([
    [{ action: 'FILE_UPLOADED', metadata: { name: 'a.png' } }, 'Uploaded “a.png”'],
    [
      { action: 'FILE_RENAMED', metadata: { name: 'b.png', previousName: 'a.png' } },
      'Renamed “a.png” to “b.png”',
    ],
    [{ action: 'FOLDER_TRASHED', metadata: { name: 'Docs' } }, 'Moved folder “Docs” to trash'],
    [
      { action: 'FOLDER_RESTORED', metadata: { name: 'Docs (restored)', previousName: 'Docs' } },
      'Restored folder “Docs” as “Docs (restored)”',
    ],
    [{ action: 'PASSWORD_CHANGED', metadata: {} }, 'Changed your password'],
    [{ action: 'FILE_DELETED' }, 'Deleted an item forever'], // no metadata at all
    [{ action: 'SOMETHING_NEW', metadata: {} }, 'Activity'], // unknown future action
  ])('%j', (entry, expected) => {
    expect(describeActivity(entry).text).toBe(expected);
  });
});
