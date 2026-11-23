import { ChevronLeft, ChevronRight, Pencil, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { formatBytes, formatDate } from '../../utils/format.js';
import { selectCurrentUser } from '../auth/authSlice.js';
import { USER_SORTS, selectClasses } from './adminFormat.js';
import { useGetAdminUsersQuery } from './adminApi.js';
import { EditUserDialog } from './EditUserDialog.jsx';

const ROLE_OPTIONS = [
  ['', 'All roles'],
  ['USER', 'Users'],
  ['ADMIN', 'Admins'],
];
const STATUS_OPTIONS = [
  ['', 'Any status'],
  ['ACTIVE', 'Active'],
  ['SUSPENDED', 'Suspended'],
];

const pill = 'rounded-full px-2 py-0.5 text-xs font-medium';

/**
 * Every account, with search, filters, sort and numbered pages. All of it lives in the
 * URL (?q=&role=&status=&sort=&page=), so a filtered view survives refresh and Back.
 */
export function UsersTable() {
  const me = useSelector(selectCurrentUser);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const sortKey = USER_SORTS[params.get('sort')] ? params.get('sort') : 'newest';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const { sortBy, sortOrder } = USER_SORTS[sortKey];
  const users = useGetAdminUsersQuery({
    ...(q && { q }),
    ...(role && { role }),
    ...(status && { status }),
    sortBy,
    sortOrder,
    page,
  });
  const [editing, setEditing] = useState(null);

  /** Changes one filter; any filter change goes back to page 1. */
  const setParam = (name, value) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );

  // Search as you type, but only ask the server once typing pauses.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    const term = search.trim();
    if (term === q) return undefined;
    const timer = setTimeout(
      () =>
        setParams(
          (current) => {
            const next = new URLSearchParams(current);
            if (term) next.set('q', term);
            else next.delete('q');
            next.delete('page');
            return next;
          },
          { replace: true },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search, q, setParams]);

  const list = users.data?.users ?? [];
  const meta = users.data?.meta;

  return (
    <section aria-labelledby="users-heading">
      <h2 id="users-heading" className="text-lg font-semibold tracking-tight">
        Users
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search users</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email"
            className={`${selectClasses} pl-9`}
          />
        </label>
        <Filter
          label="Role"
          value={role}
          options={ROLE_OPTIONS}
          onChange={(v) => setParam('role', v)}
        />
        <Filter
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => setParam('status', v)}
        />
        <Filter
          label="Sort"
          value={sortKey}
          options={Object.entries(USER_SORTS).map(([key, sort]) => [key, sort.label])}
          onChange={(v) => setParam('sort', v === 'newest' ? '' : v)}
        />
      </div>

      <div className="mt-4">
        {users.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : users.error ? (
          <ErrorState title="Couldn't load users" error={users.error} onRetry={users.refetch} />
        ) : list.length === 0 ? (
          <EmptyState title="No users match" description="Try another search or filter." />
        ) : (
          <div
            className={`overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm ${
              users.isFetching ? 'opacity-70' : ''
            }`}
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-fg-subtle uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Storage
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-right font-medium md:table-cell">
                    Files
                  </th>
                  <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                    Joined
                  </th>
                  <th scope="col" className="w-12 px-2 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((user) => (
                  <tr key={user.id}>
                    <td className="max-w-0 px-4 py-3">
                      <p className="truncate font-medium">
                        {user.name}
                        {user.id === me?.id && (
                          <span className="ml-1.5 text-xs text-fg-subtle">(you)</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-fg-subtle">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`${pill} ${
                          user.role === 'ADMIN'
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : 'bg-surface-muted text-fg-muted'
                        }`}
                      >
                        {user.role === 'ADMIN' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`${pill} ${
                          user.status === 'SUSPENDED'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-surface-muted text-fg-muted'
                        }`}
                      >
                        {user.status === 'SUSPENDED' ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {formatBytes(user.storageUsed)}
                      <span className="block text-xs text-fg-subtle">
                        of {formatBytes(user.storageLimit)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                      {user.fileCount}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-fg-muted lg:table-cell">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-2 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(user)}
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="text-fg-muted">
            Page {meta.page} of {meta.totalPages} · {meta.total} users
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setParam('page', String(meta.page - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setParam('page', String(meta.page + 1))}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      <EditUserDialog
        user={editing}
        isSelf={editing?.id === me?.id}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function Filter({ label, value, options, onChange }) {
  return (
    <label className="w-auto">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${selectClasses} w-auto pr-8`}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
