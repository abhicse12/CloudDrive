/**
 * Builds a Content-Disposition header: tells the browser whether to show a file
 * ("inline") or save it ("attachment"), and under which name.
 *
 * Filenames can contain any character (quotes, emoji, Hindi...). Two versions are sent:
 *   filename="..."        ASCII-only fallback for old clients, risky characters replaced
 *   filename*=UTF-8''...  the exact name, percent-encoded (RFC 6266 / RFC 5987)
 * Quotes, backslashes and line breaks are never written raw, so a filename can't
 * break out of the header ("header injection").
 */
export function contentDisposition(type, filename) {
  const safeName = filename || 'download';
  const asciiFallback = safeName.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
