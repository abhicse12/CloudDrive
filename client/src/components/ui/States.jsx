import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button.jsx';

/** Grey placeholder shapes while data loads: the page keeps its layout (no jumping). */
export function Skeleton({ className = '' }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />
  );
}

/** "Nothing here yet" with an icon and, usually, the action that fixes it. */
export function EmptyState({ Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}
      <h2 className="mt-4 font-medium">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A failed load, with the server's message and a Retry button. */
export function ErrorState({ title = "Couldn't load this", error, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-danger/30 bg-danger/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden="true" />
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        {error?.message ?? 'Something went wrong. Please try again.'}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
