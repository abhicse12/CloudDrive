import { formatBytes } from '../../utils/format.js';

/** "1.2 GB of 5 GB used" with a progress bar that turns amber/red as space runs out. */
export function StorageMeter({ used, limit, compact = false }) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const barColor = percent >= 95 ? 'bg-danger' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-600';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-fg">Storage</span>
        <span className="text-fg-subtle">
          {percent < 1 && used > 0 ? '<1' : Math.round(percent)}%
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!compact && (
        <p className="mt-2 text-xs text-fg-muted">
          {formatBytes(used)} of {formatBytes(limit)} used
        </p>
      )}
    </div>
  );
}
