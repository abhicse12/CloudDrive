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
