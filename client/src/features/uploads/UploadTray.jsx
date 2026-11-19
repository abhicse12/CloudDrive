import { CloudUpload } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { dialogOpened, isActive, selectUploadDialog } from './uploadSlice.js';

/**
 * Small "Uploading 3 files · 42%" pill, bottom-left, while uploads run with the dialog
 * closed. Clicking it brings the dialog back. Mounted once, in AppLayout.
 */
export function UploadTray() {
  const dispatch = useDispatch();
  const { dialogOpen, items } = useSelector(selectUploadDialog);
  const active = items.filter(isActive);
  if (dialogOpen || active.length === 0) return null;

  const total = active.reduce((sum, item) => sum + item.size, 0);
  const loaded = active.reduce((sum, item) => sum + item.loaded, 0);
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => dispatch(dialogOpened())}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm shadow-lg hover:bg-surface-muted lg:left-68"
    >
      <CloudUpload className="size-4 animate-pulse text-brand-600" aria-hidden="true" />
      Uploading {active.length} {active.length === 1 ? 'file' : 'files'} · {percent}%
    </button>
  );
}
