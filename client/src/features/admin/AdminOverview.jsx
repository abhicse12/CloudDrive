import { FileText, HardDrive, Link2, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '../../components/files/fileCategories.js';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatBytes } from '../../utils/format.js';
import { formatDay } from './adminFormat.js';
import { useGetAdminStatsQuery } from './adminApi.js';

const card = 'rounded-2xl border border-border bg-surface p-5 shadow-sm';

/** The top half of the admin page: headline numbers, sign-ups, storage, top users. */
export function AdminOverview() {
  const stats = useGetAdminStatsQuery();

  if (stats.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading statistics">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (stats.error) {
    return (
      <ErrorState title="Couldn't load statistics" error={stats.error} onRetry={stats.refetch} />
    );
  }

  const data = stats.data;
  return (
    <div className="space-y-4">
      <StatTiles data={data} />
      <div className="grid gap-4 lg:grid-cols-5">
        <SignupsChart signups={data.signups} className="lg:col-span-3" />
        <CategoryUsage byCategory={data.byCategory} className="lg:col-span-2" />
      </div>
      <TopUsers users={data.topUsers} />
    </div>
  );
}

function StatTiles({ data }) {
  const tiles = [
    {
      label: 'Users',
      value: data.users.total,
      detail: `${data.users.active} active · ${data.users.suspended} suspended`,
      Icon: Users,
    },
    { label: 'Active admins', value: data.users.admins, Icon: ShieldCheck },
    {
      label: 'Files',
      value: data.files.count,
      detail: formatBytes(data.files.bytes),
      Icon: FileText,
    },
    {
      label: 'Storage used',
      value: formatBytes(data.storage.used),
      detail: `of ${formatBytes(data.storage.allocated)} allocated`,
      Icon: HardDrive,
    },
    { label: 'Working share links', value: data.activeShares, Icon: Link2 },
  ];
  return (
    <ul aria-label="Totals" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map(({ label, value, detail, Icon }) => (
        <li key={label} className={card}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Icon className="size-4" aria-hidden="true" />
            <span>{label}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {detail && <p className="mt-0.5 text-xs text-fg-subtle">{detail}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sign-ups per UTC day, last 30 days: one series, so one hue and no legend (the title
 * names it). Each column is a hover/focus target taller than its bar; the same numbers
 * are in a table for screen readers.
 */
function SignupsChart({ signups, className }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(1, ...signups.days.map((day) => day.count));

  return (
    <section aria-labelledby="signups-heading" className={`${card} ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="signups-heading" className="font-medium">
          Sign-ups, last 30 days
        </h2>
        <span className="text-sm text-fg-muted tabular-nums">{signups.total} total</span>
      </div>

      {/* Reserved line, so the chart doesn't jump when the readout appears. */}
      <p className="mt-2 h-5 text-sm text-fg-muted" aria-hidden="true">
        {hovered
          ? `${formatDay(hovered.date)}: ${hovered.count} ${hovered.count === 1 ? 'sign-up' : 'sign-ups'}`
          : ''}
      </p>

      <div aria-hidden="true" className="relative mt-1">
        <span className="absolute top-0 left-0 text-[10px] text-fg-subtle tabular-nums">{max}</span>
        <ol
          className="flex h-36 items-end gap-0.5 border-b border-border pl-5"
          onMouseLeave={() => setHovered(null)}
        >
          {signups.days.map((day) => (
            <li
              key={day.date}
              onMouseEnter={() => setHovered(day)}
              className="flex h-full flex-1 items-end"
            >
              <div
                data-testid="signup-bar"
                className={`w-full rounded-t-sm transition-colors ${
                  hovered?.date === day.date ? 'bg-brand-700' : 'bg-brand-500'
                }`}
                style={{ height: day.count ? `${(day.count / max) * 100}%` : 0 }}
              />
            </li>
          ))}
        </ol>
        <div className="mt-1 flex justify-between pl-5 text-[10px] text-fg-subtle">
          <span>{formatDay(signups.days[0].date)}</span>
          <span>{formatDay(signups.days.at(-1).date)}</span>
        </div>
      </div>

      <table className="sr-only">
        <caption>Sign-ups per day, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {signups.days.map((day) => (
            <tr key={day.date}>
              <td>{formatDay(day.date)}</td>
              <td>{day.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Storage by file type across all users. One labelled row per type (name and size as
 * text), so the colour is never the only way to tell them apart.
 */
function CategoryUsage({ byCategory, className }) {
  const total = byCategory.reduce((sum, row) => sum + row.bytes, 0);
  return (
    <section aria-labelledby="category-heading" className={`${card} ${className}`}>
      <h2 id="category-heading" className="font-medium">
        Storage by type
      </h2>
      <ul className="mt-4 space-y-3">
        {byCategory.map((row) => {
          const look = CATEGORIES[row.category];
          const percent = total > 0 ? (row.bytes / total) * 100 : 0;
          return (
            <li key={row.category}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-fg-muted">{look.label}</span>
                <span className="tabular-nums">
                  {formatBytes(row.bytes)}
                  <span className="ml-1.5 text-xs text-fg-subtle">
                    {row.count} {row.count === 1 ? 'file' : 'files'}
                  </span>
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${look.bar}`}
                  style={{ width: row.bytes > 0 ? `max(${percent}%, 4px)` : 0 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TopUsers({ users }) {
  return (
    <section aria-labelledby="top-users-heading" className={card}>
      <h2 id="top-users-heading" className="font-medium">
        Top users by storage
      </h2>
      {users.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">No users yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {users.map((user, index) => (
            <li key={user.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-5 text-fg-subtle tabular-nums">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-fg-subtle">{user.email}</p>
              </div>
              <span className="text-right tabular-nums">
                {formatBytes(user.storageUsed)}
                <span className="block text-xs text-fg-subtle">
                  of {formatBytes(user.storageLimit)} · {user.fileCount}{' '}
                  {user.fileCount === 1 ? 'file' : 'files'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
