import { CloudUpload, FolderOpen } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { selectCurrentUser } from '../features/auth/authSlice.js';
import { ActivityFeed } from '../features/dashboard/ActivityFeed.jsx';
import { RecentFiles } from '../features/dashboard/RecentFiles.jsx';
import { StorageCard } from '../features/dashboard/StorageCard.jsx';
import { DropOverlay } from '../features/uploads/DropOverlay.jsx';
import { startUploads } from '../features/uploads/uploadQueue.js';
import { dialogOpened } from '../features/uploads/uploadSlice.js';

const ROOT = { folderId: null, folderName: 'My Files' };

/** Overview: storage by type, quick upload, recent files and recent activity. */
export function DashboardPage() {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const firstName = user.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl">
      <title>Dashboard · CloudDrive</title>

      <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName} 👋</h1>
      <p className="mt-1 text-sm text-fg-muted">Here's an overview of your CloudDrive.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <StorageCard />

        {/* Quick upload: drop files here or click; they go to My Files. */}
        <div className="lg:col-span-2">
          <DropOverlay
            targetName="My Files"
            onFiles={(files) => {
              dispatch(dialogOpened(ROOT));
              dispatch(startUploads(files, null));
            }}
          >
            <section className="flex h-full min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <CloudUpload className="size-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-medium">Quick upload</h2>
              <p className="mt-1 max-w-sm text-sm text-fg-muted">
                Drop files here, or choose them from your device. They go to My Files.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => dispatch(dialogOpened(ROOT))}>
                  <CloudUpload className="size-4" aria-hidden="true" />
                  Upload files
                </Button>
                <ButtonLink to="/app/files" variant="secondary">
                  <FolderOpen className="size-4" aria-hidden="true" />
                  Open My Files
                </ButtonLink>
              </div>
            </section>
          </DropOverlay>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentFiles />
        </div>
        <ActivityFeed />
      </div>
    </div>
  );
}
