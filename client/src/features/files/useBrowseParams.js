import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { CATEGORIES } from '../../components/files/fileCategories.js';

export const SORT_FIELDS = ['name', 'createdAt', 'size'];
const DEFAULTS = { sortBy: 'name', sortOrder: 'asc' };

/**
 * What the Files page shows, read from (and written to) the URL:
 *   /app/files/<folderId>?q=report&category=IMAGE&sortBy=size&sortOrder=desc
 *
 * The URL is the state: Back/Forward, refresh and shared links all show exactly the
 * same view. Values from the URL are untrusted (anyone can type one), so unknown ones
 * fall back to defaults instead of being sent to the API.
 */
export function useBrowseParams() {
  const { folderId = null } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const pick = (key, allowed, fallback) => {
    const value = searchParams.get(key);
    return allowed.includes(value) ? value : fallback;
  };

  const params = {
    folderId,
    q: (searchParams.get('q') ?? '').trim(),
    category: pick('category', Object.keys(CATEGORIES), null),
    sortBy: pick('sortBy', SORT_FIELDS, DEFAULTS.sortBy),
    sortOrder: pick('sortOrder', ['asc', 'desc'], DEFAULTS.sortOrder),
  };

  /** Changes some values; null/default values are removed to keep URLs short. */
  const update = useCallback(
    (changes) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '' || value === DEFAULTS[key]) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        // Sorting/filtering replaces the history entry: Back should leave the folder,
        // not undo every click on a sort option.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [params, update];
}
