/**
 * Some URLs carry a secret in their path: share link tokens (valid for days or forever)
 * and signed storage tokens (valid for minutes). Request logs must not contain them,
 * or anyone who can read the logs could open the files.
 *
 *   /api/public/shares/<token>/download?x=1  →  /api/public/shares/[REDACTED]/download?x=1
 */
const SECRET_SEGMENTS = [/(\/api\/public\/shares\/)[^/?#]+/, /(\/api\/storage\/)[^/?#]+/];

export function redactUrl(url = '') {
  return SECRET_SEGMENTS.reduce((result, pattern) => result.replace(pattern, '$1[REDACTED]'), url);
}
