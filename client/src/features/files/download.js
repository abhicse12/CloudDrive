import { toast } from '../../components/ui/toast.js';
import { apiClient, toApiError } from '../../services/apiClient.js';

// Browsers ignore (or block) several downloads started in the same instant.
const GAP_BETWEEN_DOWNLOADS_MS = 400;

/**
 * Downloads files through short-lived signed links.
 *
 * 1. Ask the API for a link (this request carries the login cookie and can refresh an
 *    expired session; a plain <a href="/api/files/x/download"> could not).
 * 2. Point a temporary <a download> at it. The browser streams the file straight to
 *    disk; the bytes never pass through JavaScript memory, so 1 GB is as fine as 1 KB.
 */
export async function downloadFiles(files) {
  for (const [index, file] of files.entries()) {
    try {
      const response = await apiClient.get(`/files/${file.id}/download`, {
        params: { disposition: 'attachment' },
      });
      const link = document.createElement('a');
      link.href = response.data.data.url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(`Couldn't download “${file.name}”: ${toApiError(error).message}`);
    }
    if (index < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, GAP_BETWEEN_DOWNLOADS_MS));
    }
  }
}
