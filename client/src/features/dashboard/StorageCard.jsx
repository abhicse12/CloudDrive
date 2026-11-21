import { Link } from 'react-router';
import { CATEGORIES } from '../../components/files/fileCategories.js';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatBytes } from '../../utils/format.js';
import { useGetStatsQuery } from './dashboardApi.js';

/**
 * Storage card: one bar split by category (images pink, videos violet...) plus trash,
 * then a legend with the exact sizes. The numbers come from /dashboard/stats, read in
 * one transaction on the server, so the parts always add up to "used".
 */
export function StorageCard() {
  const stats = useGetStatsQuery();

  if (stats.isLoading) return <Skeleton className="h-56 rounded-2xl" />;
  if (stats.error) {
    return <ErrorState title="Couldn't load storage" error={stats.error} onRetry={stats.refetch} />;
  }

  const data = stats.data;
  const share = (bytes) => (data.storageLimit > 0 ? (bytes / data.storageLimit) * 100 : 0);
  const segments = [
    ...data.byCategory
      .filter((row) => row.bytes > 0)
      .map((row) => ({ key: row.category, label: CATEGORIES[row.category].label, ...row })),
    ...(data.trashBytes > 0
      ? [{ key: 'TRASH', label: 'Trash', bytes: data.trashBytes, count: data.trashFileCount }]
      : []),
  ];
  const color = (key) => (key === 'TRASH' ? 'bg-fg-subtle/60' : CATEGORIES[key].bar);
  const summary = `${formatBytes(data.storageUsed)} of ${formatBytes(data.storageLimit)} used`;

  return (
    <section
      aria-labelledby="storage-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="storage-heading" className="font-medium">
          Storage
        </h2>
        <span className="text-sm text-fg-muted">{data.percentUsed}% used</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {formatBytes(data.storageUsed)}{' '}
        <span className="text-base font-normal text-fg-muted">
          of {formatBytes(data.storageLimit)}
        </span>
      </p>

      {/* One picture for sighted users; the legend below has the same facts as text. */}
      <div
        role="img"
        aria-label={summary}
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-muted"
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`h-full ${color(segment.key)}`}
            // At least a sliver, so a tiny category is still visible.
            style={{ width: `max(${share(segment.bytes)}%, 3px)` }}
          />
        ))}
      </div>

      {segments.length > 0 ? (
        <ul aria-label="Usage by type" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2">
              <span className={`size-2.5 shrink-0 rounded-full ${color(segment.key)}`} />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{segment.label}</span>
              <span className="tabular-nums">{formatBytes(segment.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">Nothing stored yet.</p>
      )}

      <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">
        {data.fileCount} {data.fileCount === 1 ? 'file' : 'files'} · {data.folderCount}{' '}
        {data.folderCount === 1 ? 'folder' : 'folders'}
        {data.trashBytes > 0 && (
          <>
            {' · '}
            <Link to="/app/trash" className="text-brand-600 hover:underline dark:text-brand-300">
              Empty trash to free {formatBytes(data.trashBytes)}
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
