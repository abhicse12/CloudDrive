/**
 * Where to go after login. Only our own /app pages are allowed: without this check,
 * a crafted link could send users to another site right after they log in
 * (an "open redirect", a favourite trick in phishing).
 */
export function safeRedirectPath(path) {
  return typeof path === 'string' && /^\/app(\/|$)/.test(path) ? path : '/app';
}
