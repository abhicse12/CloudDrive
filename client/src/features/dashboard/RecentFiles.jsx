import { Clock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FileIcon } from '../../components/files/FileIcon.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatBytes, formatRelative } from '../../utils/format.js';
import { PreviewModal } from '../preview/PreviewModal.jsx';
import { useGetRecentFilesQuery } from './dashboardApi.js';

/** The newest files; clicking one opens the same preview as on the Files page. */
export function RecentFiles() {
  const recent = useGetRecentFilesQuery(8);
  const [previewId, setPreviewId] = useState(null);
  const files = recent.data?.files ?? [];

  return (
    <section
      aria-labelledby="recent-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-heading" className="font-medium">
          Recent files
        </h2>
        <Link
          to="/app/files?sortBy=createdAt&sortOrder=desc"
          className="text-sm text-brand-600 hover:underline dark:text-brand-300"
        >
          View all
        </Link>
      </div>

      <div className="mt-4">
        {recent.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : recent.error ? (
          <ErrorState error={recent.error} onRetry={recent.refetch} />
        ) : files.length === 0 ? (
          <EmptyState
            Icon={Clock}
            title="No files yet"
            description="Files you upload will show up here."
          />
        ) : (
          <ul className="-mx-2">
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => setPreviewId(file.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-muted"
                >
                  <FileIcon category={file.category} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <span className="hidden text-xs text-fg-subtle sm:inline">
                    {formatBytes(file.size)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-fg-subtle">
                    {formatRelative(file.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PreviewModal
        files={files}
        fileId={previewId}
        onClose={() => setPreviewId(null)}
        onNavigate={setPreviewId}
      />
    </section>
  );
}
