import { History } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatRelative } from '../../utils/format.js';
import { useGetActivityInfiniteQuery } from './dashboardApi.js';
import { describeActivity } from './describeActivity.js';

/** "You renamed a.png to b.png · 5 minutes ago", newest first, with Load more. */
export function ActivityFeed() {
  const activity = useGetActivityInfiniteQuery();
  const entries = activity.data?.pages.flatMap((page) => page.activity) ?? [];

  return (
    <section
      aria-labelledby="activity-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <h2 id="activity-heading" className="font-medium">
        Recent activity
      </h2>

      <div className="mt-4">
        {activity.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : activity.error ? (
          <ErrorState error={activity.error} onRetry={activity.refetch} />
        ) : entries.length === 0 ? (
          <EmptyState Icon={History} title="No activity yet" />
        ) : (
          <>
            <ol className="space-y-3">
              {entries.map((entry) => {
                const { Icon, text } = describeActivity(entry);
                return (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">{text}</p>
                      <time dateTime={entry.createdAt} className="text-xs text-fg-subtle">
                        {formatRelative(entry.createdAt)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
            {activity.hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 w-full"
                onClick={() => activity.fetchNextPage()}
                loading={activity.isFetchingNextPage}
              >
                Load more
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
