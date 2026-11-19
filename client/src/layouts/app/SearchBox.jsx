import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

/**
 * Search in the top bar. Enter searches every folder (/app/files?q=...), like Drive's
 * search box. On the Files page the box shows the current search, so it matches the
 * results; clearing it returns to browsing.
 */
export function SearchBox() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const urlQuery = pathname.startsWith('/app/files') ? (searchParams.get('q') ?? '') : '';

  // Re-sync the box whenever the URL's search changes (Back button, clicking a crumb),
  // using the "adjust state while rendering" pattern instead of an effect.
  const [value, setValue] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  const submit = (event) => {
    event.preventDefault();
    const q = value.trim();
    navigate(q ? `/app/files?q=${encodeURIComponent(q)}` : '/app/files');
  };

  const clear = () => {
    setValue('');
    if (urlQuery) navigate('/app/files');
  };

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search your files"
        aria-label="Search your files"
        maxLength={100}
        className="h-10 w-full rounded-lg border border-border bg-surface pr-9 pl-9 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
