import { LogOut, Settings } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router';
import { useLogoutMutation } from '../../features/auth/authApi.js';
import { selectCurrentUser } from '../../features/auth/authSlice.js';
import { getInitials } from '../../utils/format.js';

/** Avatar button that opens a small account menu (closes on outside click / Escape). */
export function UserMenu() {
  const user = useSelector(selectCurrentUser);
  const [open, setOpen] = useState(false);
  const [logout, { isLoading }] = useLogoutMutation();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Server unreachable or session already gone: nothing to show. We are logged out
      // locally either way (authSlice), and an uncaught rejection would only be noise.
    }
    navigate('/login', { replace: true });
  }

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Account menu"
        className="grid size-9 place-items-center rounded-full bg-linear-to-br from-brand-500 to-accent-600 text-sm font-semibold text-white ring-offset-2 ring-offset-canvas transition hover:ring-2 hover:ring-brand-300"
      >
        {getInitials(user.name)}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              {user.name}
              {user.role === 'ADMIN' && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  ADMIN
                </span>
              )}
            </p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          </div>
          <div className="p-1">
            <Link
              to="/app/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <Settings className="size-4" aria-hidden="true" /> Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={isLoading}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-danger disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isLoading ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
