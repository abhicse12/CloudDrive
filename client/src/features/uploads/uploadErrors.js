import { formatBytes } from '../../utils/format.js';

/**
 * Server error code → message a person understands, per file. Unknown codes fall
 * back to the server's own message (already written for users).
 */
export function describeUploadError(apiError, { maxFileSizeBytes }) {
  switch (apiError.code) {
    case 'QUOTA_EXCEEDED':
      return 'Not enough storage space.';
    case 'FILE_TOO_LARGE':
      return `Larger than the ${formatBytes(maxFileSizeBytes)} limit.`;
    case 'UNSUPPORTED_FILE_TYPE':
      return "This file type isn't supported.";
    case 'NOT_FOUND':
      return 'The destination folder no longer exists.';
    case 'NETWORK_ERROR':
      return 'Connection lost. Check your internet and try again.';
    default:
      return apiError.message;
  }
}
