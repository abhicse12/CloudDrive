import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { ThemeToggle } from '../../components/common/ThemeToggle.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { SearchBox } from './SearchBox.jsx';
import { Toaster } from '../../components/ui/Toaster.jsx';
import { Sidebar } from './Sidebar.jsx';
import { UserMenu } from './UserMenu.jsx';

/**
 * Logged-in app frame: fixed sidebar on large screens, slide-in drawer on small ones,
 * top bar with theme switch and account menu, page content in the middle (<Outlet />).
 */
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-border bg-surface shadow-xl">
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation"
              className="absolute top-4 right-3 rounded-lg p-2 text-fg-muted hover:bg-surface-muted"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-canvas/80 px-4 backdrop-blur-lg sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <span className="lg:hidden">
            <Logo showText={false} />
          </span>

          <div className="min-w-0 flex-1">
            <SearchBox />
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Notifications for the whole app (toast.success(...) from anywhere). */}
      <Toaster />
    </div>
  );
}
