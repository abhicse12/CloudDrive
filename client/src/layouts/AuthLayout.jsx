import { ArrowLeft, FileText, Film, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { ThemeToggle } from '../components/common/ThemeToggle.jsx';
import { Logo } from '../components/ui/Logo.jsx';

// Decorative "files" floating on the brand panel (glass cards).
const SAMPLE_FILES = [
  { name: 'Specification.pdf', size: '2.4 MB', Icon: FileText, tint: 'text-rose-300' },
  { name: 'Trip-to-Sicily.mp4', size: '184 MB', Icon: Film, tint: 'text-amber-300' },
  { name: 'DSC03877.jpg', size: '6.1 MB', Icon: ImageIcon, tint: 'text-emerald-300' },
];

/**
 * Split screen for login / register / password pages: brand panel on the left
 * (hidden on small screens), form on the right.
 */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 via-brand-600 to-accent-600 p-10 text-white lg:flex">
        {/* Soft light blobs for depth */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-accent-500/40 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <Link to="/" aria-label="CloudDrive home">
            <Logo />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to website
          </Link>
        </div>

        <ul className="relative mx-auto w-full max-w-sm space-y-3" aria-hidden="true">
          {SAMPLE_FILES.map(({ name, size, Icon, tint }, index) => (
            <li
              key={name}
              className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg backdrop-blur-md"
              style={{ marginLeft: `${index * 1.5}rem` }}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-white/15">
                <Icon className={`size-5 ${tint}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block text-xs text-white/60">{size}</span>
              </span>
              <ShieldCheck className="size-4 text-white/50" />
            </li>
          ))}
        </ul>

        <div className="relative">
          <h2 className="text-3xl leading-tight font-semibold">
            Your files.
            <br />
            Safe, organised, everywhere.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Upload, preview and share with private links - with storage that grows with you.
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="CloudDrive home" className="lg:invisible">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
