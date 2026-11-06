import { useSelector } from 'react-redux';
import { Link, Outlet } from 'react-router';
import { ThemeToggle } from '../components/common/ThemeToggle.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { selectAuthStatus } from '../features/auth/authSlice.js';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

/** Marketing pages: sticky translucent header, content, footer. */
export function PublicLayout() {
  const status = useSelector(selectAuthStatus);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-canvas/75 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="CloudDrive home">
            <Logo />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-fg-muted transition-colors hover:text-fg"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* Nothing until we know who you are, to avoid a flash of the wrong buttons. */}
            {status === 'authenticated' && (
              <ButtonLink to="/app" size="sm">
                Open app
              </ButtonLink>
            )}
            {status === 'guest' && (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Log in
                </ButtonLink>
                <ButtonLink to="/register" size="sm">
                  Get started
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-fg-subtle sm:flex-row sm:px-6">
          <Logo className="text-fg-muted" />
          <p>© {new Date().getFullYear()} CloudDrive. Built as a learning project.</p>
        </div>
      </footer>
    </div>
  );
}
