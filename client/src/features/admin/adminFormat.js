/** Quotas are edited in GB (1 GB = 1024³ bytes, like formatBytes) and sent in bytes. */
export const GIB = 1024 ** 3;

/** 5368709120 → 5, 1610612736 → 1.5 (at most 2 decimals, for the edit field). */
export const bytesToGb = (bytes) => Math.round((bytes / GIB) * 100) / 100;

export const gbToBytes = (gb) => Math.round(gb * GIB);

/** Same 1 PiB ceiling as the API. */
export const MAX_LIMIT_GB = 1024 * 1024;

/** Native <select> styled like <Input>. */
export const selectClasses =
  'block h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg shadow-sm ' +
  'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** Sort choices for the users table → the API's sortBy/sortOrder. */
export const USER_SORTS = {
  newest: { label: 'Newest first', sortBy: 'createdAt', sortOrder: 'desc' },
  name: { label: 'Name A–Z', sortBy: 'name', sortOrder: 'asc' },
  storage: { label: 'Most storage', sortBy: 'storageUsed', sortOrder: 'desc' },
};

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "2026-11-20" (a UTC day from the API) → "Nov 20". */
export const formatDay = (isoDate) => DAY_LABEL.format(new Date(`${isoDate}T00:00:00Z`));
