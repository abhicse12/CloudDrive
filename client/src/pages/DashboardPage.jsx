import { CloudUpload } from 'lucide-react';
import { useSelector } from 'react-redux';
import { StorageMeter } from '../components/common/StorageMeter.jsx';
import { selectCurrentUser } from '../features/auth/authSlice.js';

/** Dashboard for this phase: greeting + real storage numbers. File widgets come in Phase 5. */
export function DashboardPage() {
  const user = useSelector(selectCurrentUser);
  const firstName = user.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-5xl">
      <title>Dashboard · CloudDrive</title>

      <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName} 👋</h1>
      <p className="mt-1 text-sm text-fg-muted">Here's an overview of your CloudDrive.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <StorageMeter used={user.storageUsed} limit={user.storageLimit} />
        </section>

        <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-8 text-center md:col-span-2">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <CloudUpload className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-medium">No files yet</h2>
          <p className="mt-1 max-w-sm text-sm text-fg-muted">
            Uploading, folders and previews arrive in the next phase. Your account is ready for
            them.
          </p>
        </section>
      </div>
    </div>
  );
}
