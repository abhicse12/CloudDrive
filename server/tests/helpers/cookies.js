/**
 * Finds one cookie in a response's Set-Cookie headers.
 * Returns { value, raw } where raw is the full header (to inspect HttpOnly, Path, ...).
 */
export function getCookie(res, name) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  if (!header) return undefined;
  return { value: header.split(';')[0].slice(name.length + 1), raw: header };
}
