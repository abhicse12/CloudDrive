import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileIcon } from '../../components/files/FileIcon.jsx';
import { categoryLook } from '../../components/files/fileCategories.js';
import { previewKind } from '../../components/files/previewKind.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatBytes, formatDate } from '../../utils/format.js';
import { downloadFiles } from '../files/download.js';
import { useGetPreviewLinkQuery } from '../files/filesApi.js';

// Text previews show the start of the file only: a 100 MB log would freeze the tab.
const TEXT_PREVIEW_BYTES = 1024 * 1024;

const iconButton =
  'rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40';

/**
 * Full-size preview of one file, with ← → through the files currently listed.
 * files: the list to step through. fileId: the one shown (null = closed).
 */
export function PreviewModal({ files, fileId, onClose, onNavigate }) {
  const index = files.findIndex((file) => file.id === fileId);
  const file = index >= 0 ? files[index] : null;
  const previous = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  // ← → move between files. Not while a video/audio player has focus: there, the
  // arrows already mean "seek", and stealing them would be confusing.
  useEffect(() => {
    if (!file) return undefined;
    const onKeyDown = (event) => {
      if (event.target.closest?.('video, audio')) return;
      if (event.key === 'ArrowLeft' && previous) onNavigate(previous.id);
      if (event.key === 'ArrowRight' && next) onNavigate(next.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, previous, next, onNavigate]);

  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      title={file?.name ?? 'Preview'}
      description={
        file &&
        `${formatBytes(file.size)} · ${categoryLook(file.category).singular} · Added ${formatDate(file.createdAt)}`
      }
      size="full"
      footer={
        file && (
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={iconButton}
                disabled={!previous}
                onClick={() => onNavigate(previous.id)}
                aria-label="Previous file"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <span className="text-xs text-fg-subtle tabular-nums">
                {index + 1} of {files.length}
              </span>
              <button
                type="button"
                className={iconButton}
                disabled={!next}
                onClick={() => onNavigate(next.id)}
                aria-label="Next file"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Button variant="secondary" onClick={() => downloadFiles([file])}>
              <Download className="size-4" aria-hidden="true" />
              Download
            </Button>
          </div>
        )
      }
    >
      {/* key: a different file = a fresh preview (no old image flashing). */}
      {file && <PreviewBody key={file.id} file={file} />}
    </Dialog>
  );
}

function PreviewBody({ file }) {
  const kind = previewKind(file.mimeType);
  const link = useGetPreviewLinkQuery(file.id, {
    skip: !kind,
    // Signed links expire: always ask for a fresh one when a preview opens.
    refetchOnMountOrArgChange: true,
  });

  if (!kind) return <NoPreview file={file} reason="This file type can't be previewed." />;
  if (link.isLoading) return <Skeleton className="h-[min(70vh,calc(100dvh-19rem))]" />;
  if (link.error) {
    return (
      <ErrorState title="Couldn't load the preview" error={link.error} onRetry={link.refetch} />
    );
  }
  // The server has the last word on what may be shown inline.
  if (link.data.disposition !== 'inline') {
    return <NoPreview file={file} reason="This file type can't be previewed." />;
  }

  const { url } = link.data;
  // Title, footer and padding take ~19rem: the preview gets what's left of the window
  // (dvh = visible height, also on phones), so the whole dialog always fits.
  const frame = 'max-h-[min(70vh,calc(100dvh-19rem))] w-full rounded-xl bg-surface-muted/60';

  return (
    <div className="space-y-3">
      {kind === 'image' && <img src={url} alt={file.name} className={`${frame} object-contain`} />}
      {kind === 'video' && <video src={url} controls preload="metadata" className={frame} />}
      {kind === 'audio' && (
        <div className="grid place-items-center gap-6 rounded-xl bg-surface-muted/60 py-12">
          <FileIcon category="AUDIO" size="lg" />
          <audio src={url} controls preload="metadata" className="w-full max-w-md" />
        </div>
      )}
      {kind === 'pdf' && (
        <iframe
          src={url}
          title={`Preview of ${file.name}`}
          className={`${frame} h-[min(70vh,calc(100dvh-19rem))]`}
        />
      )}
      {kind === 'text' && <TextPreview url={url} size={file.size} />}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline dark:text-brand-300"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Open in a new tab
      </a>
    </div>
  );
}

/**
 * The first TEXT_PREVIEW_BYTES of a text file. An HTTP Range request asks for just
 * those bytes (the server supports ranges), so a huge file isn't downloaded whole.
 */
function TextPreview({ url, size }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, {
      headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => setState({ status: 'ready', text }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error' });
      });
    // Switching files mid-load: cancel, so an old file's text can't appear late.
    return () => controller.abort();
  }, [url]);

  if (state.status === 'loading') return <Skeleton className="h-[min(70vh,calc(100dvh-19rem))]" />;
  if (state.status === 'error') {
    return <ErrorState title="Couldn't load the text" error={{ message: 'Please try again.' }} />;
  }
  return (
    <div>
      <pre className="max-h-[min(70vh,calc(100dvh-19rem))] overflow-auto rounded-xl bg-surface-muted/60 p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {state.text}
      </pre>
      {size > TEXT_PREVIEW_BYTES && (
        <p className="mt-2 text-xs text-fg-subtle">
          Showing the first {formatBytes(TEXT_PREVIEW_BYTES)} of {formatBytes(size)}. Download the
          file to see all of it.
        </p>
      )}
    </div>
  );
}

function NoPreview({ file, reason }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-surface-muted/60 px-6 py-14 text-center">
      <FileIcon category={file.category} size="lg" />
      <p className="mt-4 font-medium">{reason}</p>
      <p className="mt-1 text-sm text-fg-muted">Download it to open it on your device.</p>
      <Button className="mt-5" onClick={() => downloadFiles([file])}>
        <Download className="size-4" aria-hidden="true" />
        Download
      </Button>
    </div>
  );
}
