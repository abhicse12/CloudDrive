import { CheckCircle2, CloudUpload, X, XCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FileIcon } from '../../components/files/FileIcon.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { useGetConfigQuery } from '../../services/configApi.js';
import { formatBytes } from '../../utils/format.js';
import { useGetStatsQuery } from '../dashboard/dashboardApi.js';
import { cancelUpload, startUploads } from './uploadQueue.js';
import {
  dialogClosed,
  finishedCleared,
  isActive,
  removed,
  selectUploadDialog,
} from './uploadSlice.js';

/** A rough category from the browser's MIME type, only to pick an icon before upload. */
function guessCategory(type = '') {
  if (type.startsWith('image/')) return 'IMAGE';
  if (type.startsWith('video/')) return 'VIDEO';
  if (type.startsWith('audio/')) return 'AUDIO';
  if (/zip|compressed|tar|rar|7z/.test(type)) return 'ARCHIVE';
  if (type.startsWith('text/') || /pdf|document|sheet|presentation|json/.test(type)) {
    return 'DOCUMENT';
  }
  return 'OTHER';
}

/**
 * "Upload files" dialog: a dropzone, then one row per file with its progress.
 * Closing it does NOT stop uploads; they continue in the background (see UploadTray).
 */
export function UploadDialog() {
  const dispatch = useDispatch();
  const { dialogOpen, items, target } = useSelector(selectUploadDialog);
  const { data: config } = useGetConfigQuery();
  // Loads the storage numbers the "enough space?" pre-check uses.
  useGetStatsQuery(undefined, { skip: !dialogOpen });

  const finished = items.filter((item) => !isActive(item)).length;
  const active = items.length - finished;

  return (
    <Dialog
      open={dialogOpen}
      onClose={() => dispatch(dialogClosed())}
      title="Upload files"
      description={`To ${target.folderName}`}
      size="lg"
      footer={
        <>
          {finished > 0 && (
            <Button variant="ghost" onClick={() => dispatch(finishedCleared())}>
              Clear finished
            </Button>
          )}
          <Button onClick={() => dispatch(dialogClosed())}>{active > 0 ? 'Hide' : 'Done'}</Button>
        </>
      }
    >
      <Dropzone
        maxFileSizeBytes={config?.maxFileSizeBytes}
        onFiles={(files) => dispatch(startUploads(files, target.folderId))}
      />

      {items.length > 0 && (
        <ul aria-label="Uploads" className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function Dropzone({ onFiles, maxFileSizeBytes }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault(); // required, or the browser won't allow a drop here
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragging
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
          : 'border-border hover:border-brand-300 hover:bg-surface-muted/60'
      }`}
    >
      <CloudUpload className="size-8 text-brand-600 dark:text-brand-300" aria-hidden="true" />
      <span className="mt-3 text-sm font-medium">
        Drag & drop files or <span className="text-brand-600 dark:text-brand-300">browse</span>
      </span>
      {maxFileSizeBytes && (
        <span className="mt-1 text-xs text-fg-subtle">
          Up to {formatBytes(maxFileSizeBytes)} per file
        </span>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          if (event.target.files.length) onFiles(event.target.files);
          event.target.value = ''; // so choosing the same file again still fires onChange
        }}
      />
    </label>
  );
}

function UploadRow({ item }) {
  const dispatch = useDispatch();
  const percent = item.size > 0 ? Math.round((item.loaded / item.size) * 100) : 100;
  const running = isActive(item);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-3">
      <FileIcon category={guessCategory(item.type)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(item.size)}</span>
        </div>

        {item.status === 'error' ? (
          <p className="mt-1 text-xs text-danger">{item.error}</p>
        ) : item.status === 'canceled' ? (
          <p className="mt-1 text-xs text-fg-subtle">Canceled</p>
        ) : (
          <div
            role="progressbar"
            aria-label={`Uploading ${item.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                item.status === 'done' ? 'bg-success' : 'bg-brand-600'
              }`}
              style={{ width: `${item.status === 'queued' ? 0 : percent}%` }}
            />
          </div>
        )}
      </div>

      {item.status === 'done' && (
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Uploaded" />
      )}
      {item.status === 'error' && (
        <XCircle className="size-5 shrink-0 text-danger" aria-label="Failed" />
      )}
      <button
        type="button"
        onClick={() => dispatch(running ? cancelUpload(item.id) : removed(item.id))}
        aria-label={running ? `Cancel ${item.name}` : `Remove ${item.name} from list`}
        className="shrink-0 rounded-lg p-1.5 text-fg-subtle hover:bg-surface-muted hover:text-fg"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
