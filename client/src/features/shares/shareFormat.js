const DATE_TIME = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Expires Nov 30, 2026, 4:15 PM" or "Never expires", in the user's own format. */
export function formatExpiry(expiresAt) {
  if (!expiresAt) return 'Never expires';
  return `Expires ${DATE_TIME.format(new Date(expiresAt))}`;
}
