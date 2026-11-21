const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1.5 KB". Uses 1024 steps, like operating systems do for file sizes. */
export function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  // No decimals for whole numbers or plain bytes: "5 GB", not "5.0 GB".
  const digits = exponent === 0 || Number.isInteger(value) ? 0 : decimals;
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`;
}

/** "Abhishek Pandey" → "AP", "alice" → "A". */
export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts.at(-1)[0]] : [parts[0]?.[0] ?? '?'];
  return letters.join('').toUpperCase();
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const FULL_DATE = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** "Nov 19" this year, "Nov 19, 2025" otherwise. In the user's own language/format. */
export function formatDate(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() === now.getFullYear()
    ? SHORT_DATE.format(date)
    : FULL_DATE.format(date);
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * "just now", "5 minutes ago", "yesterday", "in 27 days", in the user's language.
 * Uses the largest unit that fits, like people say it.
 */
export function formatRelative(value, now = new Date()) {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (Math.abs(seconds) < 60) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
