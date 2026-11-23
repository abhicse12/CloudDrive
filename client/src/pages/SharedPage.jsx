import { Link2, Link2Off, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { FileIcon } from '../components/files/FileIcon.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { toast } from '../components/ui/toast.js';
import { RegenerateDialog } from '../features/shares/RegenerateDialog.jsx';
import { useGetSharesInfiniteQuery, useRevokeShareMutation } from '../features/shares/sharesApi.js';
import { formatDate, formatRelative } from '../utils/format.js';

const TABS = [
  { status: 'active', label: 'Active' },
  { status: 'expired', label: 'Expired' },
  { status: 'revoked', label: 'Revoked' },
];

const EMPTY = {
  active: {
    title: 'No active links',
    description: 'Share a file from My Files: its ⋯ menu has “Share…”.',
  },
  expired: { title: 'No expired links', description: 'Links appear here once they run out.' },
  revoked: { title: 'No revoked links', description: 'Links you turn off appear here.' },
};

/** "in 3 days" / "2 hours ago" / "Never", as people say it. */
function expiryText(share) {
  if (!share.expiresAt) return 'Never';
  return formatRelative(share.expiresAt);
}

/**
 * /app/shared: every link the user created, by status. Tokens are never shown again
 * (the server doesn't have them), so an active link can be revoked or replaced
 * ("Get a new link"), not copied.
 */
export function SharedPage() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((tab) => tab.status === params.get('status'))
    ? params.get('status')
    : 'active';
  const shares = useGetSharesInfiniteQuery({ status });
  const [revokeShare] = useRevokeShareMutation();

  const [revoking, setRevoking] = useState(null); // share being confirmed
  const [revokeState, setRevokeState] = useState({ loading: false, error: null });
  const [regenerating, setRegenerating] = useState(null);

  const pages = shares.data?.pages ?? [];
  const list = pages.flatMap((page) => page.shares);
  const total = pages[0]?.meta.total ?? 0;

  const selectTab = (next) =>
    setParams(next === 'active' ? {} : { status: next }, { replace: true });

  const closeRevoke = () => {
    setRevoking(null);
    setRevokeState({ loading: false, error: null });
  };

  async function confirmRevoke() {
    setRevokeState({ loading: true, error: null });
    try {
      await revokeShare(revoking.id).unwrap();
      toast.success(`Stopped sharing “${revoking.file.name}”`);
      closeRevoke();
    } catch (error) {
      setRevokeState({ loading: false, error: error.message });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <title>Shared · CloudDrive</title>
      <h1 className="text-2xl font-semibold tracking-tight">Shared links</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Anyone with an active link can download its file. Turn a link off at any time.
      </p>

      <div
        role="tablist"
        aria-label="Link status"
        className="mt-6 flex gap-1 border-b border-border"
      >
        {TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            role="tab"
            id={`tab-${tab.status}`}
            aria-selected={status === tab.status}
            aria-controls="shares-panel"
            onClick={() => selectTab(tab.status)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              status === tab.status
                ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="shares-panel" role="tabpanel" aria-labelledby={`tab-${status}`} className="mt-6">
        {shares.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading links">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : shares.error ? (
          <ErrorState
            title="Couldn't load your links"
            error={shares.error}
            onRetry={shares.refetch}
          />
        ) : list.length === 0 ? (
          <EmptyState Icon={Link2} {...EMPTY[status]} />
        ) : (
          <>
            <ul
              aria-label={`${TABS.find((t) => t.status === status).label} links`}
              className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm"
            >
              {list.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  onRevoke={() => setRevoking(share)}
                  onRegenerate={() => setRegenerating(share)}
                />
              ))}
            </ul>
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs text-fg-subtle">
                Showing {list.length} of {total} links
              </p>
              {shares.hasNextPage && (
                <Button
                  variant="secondary"
                  onClick={() => shares.fetchNextPage()}
                  loading={shares.isFetchingNextPage}
                >
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={closeRevoke}
        onConfirm={confirmRevoke}
        loading={revokeState.loading}
        error={revokeState.error}
        danger
        title={`Stop sharing “${revoking?.file.name}”?`}
        description="The link stops working right away for everyone who has it. This can’t be undone, but you can always share the file again."
        confirmLabel="Turn off link"
      />
      <RegenerateDialog share={regenerating} onClose={() => setRegenerating(null)} />
    </div>
  );
}

function ShareRow({ share, onRevoke, onRegenerate }) {
  const active = share.status === 'active';
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileIcon category={share.file.category} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium" title={share.file.name}>
              {share.file.name}
            </p>
            {!share.fileAvailable && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">
                File in trash
              </span>
            )}
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <Detail label="Created" value={formatDate(share.createdAt)} />
            {share.status === 'revoked' ? (
              <Detail label="Turned off" value={formatRelative(share.revokedAt)} />
            ) : (
              <Detail
                label={share.status === 'expired' ? 'Expired' : 'Expires'}
                value={expiryText(share)}
              />
            )}
            {/* accessCount counts downloads and "Open" alike: the file's bytes left. */}
            <Detail label="Downloads" value={share.accessCount} />
            <Detail
              label="Last downloaded"
              value={share.lastAccessedAt ? formatRelative(share.lastAccessedAt) : 'Never'}
            />
          </dl>
        </div>
      </div>

      {active && (
        <div className="flex shrink-0 gap-2 sm:ml-2">
          {/* The server refuses new links while the file is in trash. */}
          {share.fileAvailable && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRegenerate}
              aria-label={`Get a new link for ${share.file.name}`}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              New link
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger"
            onClick={onRevoke}
            aria-label={`Stop sharing ${share.file.name}`}
          >
            <Link2Off className="size-4" aria-hidden="true" />
            Turn off
          </Button>
        </div>
      )}
    </li>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg-muted tabular-nums">{value}</dd>
    </div>
  );
}
