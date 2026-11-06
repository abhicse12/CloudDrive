import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './ThemeContext.js';

// Must match the inline script in index.html.
const STORAGE_KEY = 'clouddrive-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system'; // storage can be blocked (private mode); just follow the OS
  }
}

/**
 * Owns the ONE theme state for the whole app. Preference is 'light' | 'dark' | 'system'
 * ('system' follows the operating system setting, live).
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  // Follow live OS changes (e.g. automatic dark mode at sunset) while on 'system'.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next) => {
    setPreference(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisted, but still applied for this visit */
    }
  }, []);

  // useMemo: consumers only re-render when a value actually changes.
  const value = useMemo(
    () => ({ preference, resolvedTheme, setTheme }),
    [preference, resolvedTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
