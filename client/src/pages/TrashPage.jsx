import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { FileIcon } from '../components/files/FileIcon.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { toast } from '../components/ui/toast.js';
import {
  useDeleteFileForeverMutation,
  useDeleteFolderForeverMutation,
  useRestoreFileMutation,
  useRestoreFolderMutation,
} from '../features/files/filesApi.js';
import { useEmptyTrashMutation, useGetTrashInfiniteQuery } from '../features/trash/trashApi.js';
import { formatBytes, formatRelative } from '../utils/format.js';

/**
 * /app/trash: what was deleted, when it disappears for good, Restore / Delete forever,
 * and Empty trash. Only top-level items are listed (the API's rule): a folder's
 * contents come back with it.
 */
export function TrashPage() {
  const trash = useGetTrashInfiniteQuery();
  const [restoreFile] = useRestoreFileMutation();
  const [restoreFolder] = useRestoreFolderMutation();
  const [deleteFileForever] = useDeleteFileForeverMutation();
  const [deleteFolderForever] = useDeleteFolderForeverMutation();
  const [emptyTrash] = useEmptyTrashMutation();

  // { kind: 'item', item } | { kind: 'empty' } | null, plus its running/error state
  const [confirm, setConfirm] = useState(null);
  const [confirmState, setConfirmState] = useState({ loading: false, error: null });

  const pages = trash.data?.pages ?? [];
  const folders = (pages[0]?.folders ?? []).map((folder) => ({ ...folder, kind: 'folder' }));
  const files = pages.flatMap((page) => page.files).map((file) => ({ ...file, kind: 'file' }));
  const items = [...folders, ...files];
  const retentionDays = pages[0]?.retentionDays ?? 30;
  const totalItems = folders.length + (pages[0]?.meta.total ?? 0);

  async function restore(item) {
    try {
      if (item.kind === 'file') await restoreFile(item.id).unwrap();
      else await restoreFolder(item.id).unwrap();
      toast.success(`Restored “${item.name}”`);
    } catch (error) {
      toast.error(`Couldn't restore “${item.name}”: ${error.message}`);
    }
  }

  const closeConfirm = () => {
    setConfirm(null);
    setConfirmState({ loading: false, error: null });
  };

  async function runConfirmed() {
    setConfirmState({ loading: true, error: null });
    try {
      if (confirm.kind === 'empty') {
        const result = await emptyTrash().unwrap();
        const count = result.files + result.folders;
        toast.success(`Trash emptied: ${count} ${count === 1 ? 'item' : 'items'} deleted forever`);
      } else {
        const { item } = confirm;
        if (item.kind === 'file') await deleteFileForever(item.id).unwrap();
        else await deleteFolderForever(item.id).unwrap();
        toast.success(`Deleted “${item.name}” forever`);
      }
      closeConfirm();
    } catch (error) {
      // Shown inside the dialog, e.g. "Wait for uploads in this folder to finish."
      setConfirmState({ loading: false, error: error.message });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <title>Trash · CloudDrive</title>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <Button
          variant="secondary"
          size="sm"
          disabled={items.length === 0}
          onClick={() => setConfirm({ kind: 'empty' })}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Empty trash
        </Button>
      </div>

      <Alert variant="info" className="mt-4">
        Items are deleted forever {retentionDays} days after they're moved here. Until then they
        still count toward your storage.
      </Alert>

      <div className="mt-6">
        {trash.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading trash">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : trash.error ? (
          <ErrorState title="Couldn't load the trash" error={trash.error} onRetry={trash.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            Icon={Trash2}
            title="Trash is empty"
            description={`Items you delete stay here for ${retentionDays} days before they're removed for good.`}
          />
        ) : (
          <>
            <ul
              aria-label="Items in trash"
              className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm"
            >
              {items.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="flex items-center gap-3 px-4 py-3">
                  <FileIcon folder={item.kind === 'folder'} category={item.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {item.kind === 'file' ? `${formatBytes(item.size)} · ` : 'Folder · '}
                      Deleted {formatRelative(item.deletedAt)} · Gone for good{' '}
                      {formatRelative(item.purgesAt)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restore(item)}
                    aria-label={`Restore ${item.name}`}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Restore</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => setConfirm({ kind: 'item', item })}
                    aria-label={`Delete ${item.name} forever`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Delete forever</span>
                  </Button>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs text-fg-subtle">
                Showing {items.length} of {totalItems} items
              </p>
              {trash.hasNextPage && (
                <Button
                  variant="secondary"
                  onClick={() => trash.fetchNextPage()}
                  loading={trash.isFetchingNextPage}
                >
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={closeConfirm}
        onConfirm={runConfirmed}
        loading={confirmState.loading}
        error={confirmState.error}
        danger
        title={
          confirm?.kind === 'empty'
            ? 'Empty the trash?'
            : `Delete “${confirm?.item?.name}” forever?`
        }
        description={
          confirm?.kind === 'empty'
            ? `All ${totalItems} items will be deleted forever. This can't be undone.`
            : confirm?.item?.kind === 'folder'
              ? 'The folder and everything inside it will be deleted. This can’t be undone.'
              : 'This can’t be undone.'
        }
        confirmLabel={confirm?.kind === 'empty' ? 'Empty trash' : 'Delete forever'}
      />
    </div>
  );
}
