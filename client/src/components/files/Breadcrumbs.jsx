import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

/**
 * My Files › Documents › Work. Every part but the last is a link; the last is the
 * current page (aria-current), as screen readers expect for a breadcrumb trail.
 * crumbs: [{ id, name }] from the API, root first (the root itself is added here).
 */
export function Breadcrumbs({ crumbs = [] }) {
  const trail = [{ id: null, name: 'My Files' }, ...crumbs];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={crumb.id ?? 'root'} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              )}
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-fg">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={crumb.id ? `/app/files/${crumb.id}` : '/app/files'}
                  className="truncate rounded px-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
