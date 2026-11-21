import { ChevronRight, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { FileIcon } from '../../components/files/FileIcon.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useGetFolderTreeQuery } from './filesApi.js';
import { blockedDestinations, childrenByParent } from './folderTree.js';
import { describeItems } from './useItemActions.js';

const ROOT = { id: null, name: 'My Files' };

/**
 * "Move to…" picker. items: what is being moved (null = closed).
 * currentFolderId: where they are now (that choice is pointless, so disabled).
 * onMove(destination) with destination = { id, name }.
 */
export function MoveDialog({ items, currentFolderId, onClose, onMove }) {
  return (
    <Dialog
      open={Boolean(items)}
      onClose={onClose}
      title={items ? `Move ${describeItems(items)}` : 'Move'}
      description="Choose a destination folder."
      size="lg"
    >
      {items && (
        <MovePicker
          items={items}
          currentFolderId={currentFolderId}
          onCancel={onClose}
          onMove={onMove}
        />
      )}
    </Dialog>
  );
}

function MovePicker({ items, currentFolderId, onCancel, onMove }) {
  const tree = useGetFolderTreeQuery();
  const [chosen, setChosen] = useState(null); // { id, name } | null
  const [expanded, setExpanded] = useState(() => new Set());
  const [moving, setMoving] = useState(false);

  if (tree.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading folders">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }
  if (tree.error) return <ErrorState error={tree.error} onRetry={tree.refetch} />;

  const folders = tree.data.folders;
  const children = childrenByParent(folders);
  const blocked = blockedDestinations(
    folders,
    items.filter((item) => item.kind === 'folder').map((item) => item.id),
  );

  const toggleExpanded = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (folder, depth) => {
    const isRoot = folder.id === null;
    const kids = children.get(folder.id) ?? [];
    const open = isRoot || expanded.has(folder.id);
    const isBlocked = blocked.has(folder.id);
    const isCurrent = folder.id === currentFolderId;
    const disabled = isBlocked || isCurrent;
    const isChosen = chosen?.id === folder.id && chosen !== null;

    return (
      <li key={folder.id ?? 'root'}>
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
          {!isRoot && kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleExpanded(folder.id)}
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${folder.name}`}
              className="rounded p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg"
            >
              <ChevronRight
                className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={isChosen}
            onClick={() => setChosen({ id: folder.id, name: folder.name })}
            title={
              isBlocked
                ? "A folder can't be moved into itself"
                : isCurrent
                  ? 'Already here'
                  : undefined
            }
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45 ${
              isChosen
                ? 'bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-500 dark:bg-brand-500/15 dark:text-brand-200'
                : 'hover:bg-surface-muted'
            }`}
          >
            {isRoot ? (
              <HardDrive className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            ) : (
              <FileIcon folder size="sm" className="size-6! rounded-md!" />
            )}
            <span className="truncate">{folder.name}</span>
            {isCurrent && <span className="ml-auto text-xs text-fg-subtle">Current</span>}
          </button>
        </div>
        {open && kids.length > 0 && <ul>{kids.map((child) => renderRow(child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <ul
        aria-label="Folders"
        className="max-h-80 overflow-y-auto rounded-xl border border-border p-2"
      >
        {renderRow(ROOT, 0)}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={moving}>
          Cancel
        </Button>
        <Button
          disabled={!chosen}
          loading={moving}
          onClick={async () => {
            setMoving(true);
            try {
              await onMove(chosen);
            } finally {
              setMoving(false);
            }
          }}
        >
          {chosen ? `Move to ${chosen.name}` : 'Move here'}
        </Button>
      </div>
    </>
  );
}
