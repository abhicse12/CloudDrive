import { toast } from '../../components/ui/toast.js';
import {
  useBulkFilesMutation,
  useRestoreFolderMutation,
  useTrashFolderMutation,
  useUpdateFolderMutation,
} from './filesApi.js';

/** “report.pdf” for one item, “3 items” for several. */
export const describeItems = (items) =>
  items.length === 1 ? `“${items[0].name}”` : `${items.length} items`;

const split = (items) => ({
  fileIds: items.filter((item) => item.kind === 'file').map((item) => item.id),
  folders: items.filter((item) => item.kind === 'folder'),
});

/**
 * Trash / restore / move for any mix of files and folders, used by the selection
 * toolbar, ⋯ menus, right-click and keyboard shortcuts alike, so they all behave
 * the same.
 *
 * Files go in ONE bulk request; folders have no bulk endpoint, so one request each,
 * in parallel. allSettled (not all): if one folder fails, the rest still happen, and
 * the user is told exactly what didn't work.
 */
export function useItemActions() {
  const [bulkFiles] = useBulkFilesMutation();
  const [trashFolder] = useTrashFolderMutation();
  const [restoreFolder] = useRestoreFolderMutation();
  const [updateFolder] = useUpdateFolderMutation();

  async function run(items, { filesRequest, folderRequest }) {
    const { fileIds, folders } = split(items);
    const results = await Promise.allSettled([
      ...(fileIds.length ? [filesRequest(fileIds).unwrap()] : []),
      ...folders.map((folder) => folderRequest(folder).unwrap()),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    return { failures, allFailed: failures.length === results.length };
  }

  function reportFailures(failures, verb) {
    if (failures.length === 0) return;
    toast.error(`Couldn't ${verb} some items: ${failures[0].reason.message}`);
  }

  async function restore(items) {
    const { failures, allFailed } = await run(items, {
      filesRequest: (ids) => bulkFiles({ action: 'restore', ids }),
      folderRequest: (folder) => restoreFolder(folder.id),
    });
    if (!allFailed) toast.success(`Restored ${describeItems(items)}`);
    reportFailures(failures, 'restore');
  }

  async function trash(items) {
    const { failures, allFailed } = await run(items, {
      filesRequest: (ids) => bulkFiles({ action: 'trash', ids }),
      folderRequest: (folder) => trashFolder(folder.id),
    });
    if (!allFailed) {
      toast.success(`Moved ${describeItems(items)} to trash`, {
        action: { label: 'Undo', onClick: () => restore(items) },
      });
    }
    reportFailures(failures, 'move to trash');
  }

  /** destination: { id, name } (id null = My Files). */
  async function move(items, destination) {
    const { failures, allFailed } = await run(items, {
      filesRequest: (ids) => bulkFiles({ action: 'move', ids, folderId: destination.id }),
      folderRequest: (folder) => updateFolder({ id: folder.id, parentId: destination.id }),
    });
    if (!allFailed) toast.success(`Moved ${describeItems(items)} to ${destination.name}`);
    reportFailures(failures, 'move');
  }

  return { trash, restore, move };
}
