import { useSelector } from 'react-redux';
import { Link, NavLink } from 'react-router';
import { StorageMeter } from '../../components/common/StorageMeter.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { selectCurrentUser } from '../../features/auth/authSlice.js';
import { NAV_ITEMS } from './navigation.js';

const itemBase =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';

/** Sidebar content, shared by the desktop sidebar and the mobile drawer. */
export function Sidebar({ onNavigate }) {
  const user = useSelector(selectCurrentUser);
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/app" onClick={onNavigate} className="px-2 pt-1" aria-label="Dashboard">
        <Logo />
      </Link>

      <nav aria-label="App" className="flex-1">
        <ul className="space-y-1">
          {items.map(({ to, label, Icon, end, soon }) => (
            <li key={to}>
              {soon ? (
                <span
                  aria-disabled="true"
                  title="Coming in a later phase"
                  className={`${itemBase} cursor-not-allowed text-fg-subtle`}
                >
                  <Icon className="size-4.5" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    Soon
                  </span>
                </span>
              ) : (
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `${itemBase} ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                    }`
                  }
                >
                  <Icon className="size-4.5" aria-hidden="true" />
                  {label}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {user && (
        <div className="rounded-xl border border-border bg-canvas p-4">
          <StorageMeter used={user.storageUsed} limit={user.storageLimit} />
        </div>
      )}
    </div>
  );
}
