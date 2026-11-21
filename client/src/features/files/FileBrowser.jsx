import { Download, Eye, FolderInput, FolderOpen, Pencil, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileGrid, FileTable } from '../../components/files/FileViews.jsx';
import { FolderCard } from '../../components/files/FolderCard.jsx';
import { ContextMenu } from '../../components/ui/ContextMenu.jsx';
import { MoveDialog } from './MoveDialog.jsx';
import { RenameDialog } from './RenameDialog.jsx';
import { SelectionToolbar } from './SelectionToolbar.jsx';
import { keyOf } from './selection.js';
import { PreviewModal } from '../preview/PreviewModal.jsx';
import { downloadFiles } from './download.js';
import { useItemActions } from './useItemActions.js';
import { useSelection } from './useSelection.js';

// Shortcuts must not fire while typing (search box, rename field...).
// Checkboxes are inputs too, but Delete on a focused checkbox should still work.
const isTyping = (target) =>
  target.isContentEditable || target.matches?.('input:not([type="checkbox"]), textarea, select');

/**
 * The folder/file area of the Files page: selection, toolbar, menus, dialogs and
 * keyboard shortcuts. FilesPage owns the data; this owns the interaction.
 *
 * placeholder: shown instead of the lists (loading / error / empty).
 * currentFolderId: the folder being viewed (undefined in search results, which mix
 * folders), used to disable "move to where it already is".
 */
export function FileBrowser({
  folders,
  files,
  viewMode,
  scope,
  currentFolderId,
  toolbar,
  placeholder,
  filesFooter,
}) {
  const navigate = useNavigate();
  const actions = useItemActions();

  const folderItems = folders.map((folder) => ({ ...folder, kind: 'folder' }));
  const fileItems = files.map((file) => ({ ...file, kind: 'file' }));
  const allItems = [...folderItems, ...fileItems];
  const selection = useSelection(allItems.map(keyOf), scope);
  const selectedItems = allItems.filter((item) => selection.selected.has(keyOf(item)));

  const [dialog, setDialog] = useState(null); // { type: 'rename', item } | { type: 'move', items }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, targets }
  const [previewId, setPreviewId] = useState(null);

  // ⋯ / right-click on a selected item acts on the whole selection; on an unselected
  // one, only on that item (like Finder / Explorer / Drive).
  const targetsFor = (item) =>
    selection.isSelected(keyOf(item)) && selectedItems.length > 1 ? selectedItems : [item];

  const open = (item) => {
    if (item.kind === 'folder') navigate(`/app/files/${item.id}`);
    else setPreviewId(item.id);
  };

  // Folders can't be downloaded (that would need a ZIP): offer Download for files only.
  const onlyFiles = (targets) => targets.every((target) => target.kind === 'file');

  const trash = (targets) => {
    selection.clear();
    actions.trash(targets);
  };

  const menuFor = (targets) => {
    const single = targets.length === 1 ? targets[0] : null;
    return [
      ...(single
        ? [
            single.kind === 'folder'
              ? { label: 'Open', Icon: FolderOpen, onSelect: () => open(single) }
              : { label: 'Preview', Icon: Eye, onSelect: () => open(single) },
          ]
        : []),
      ...(onlyFiles(targets)
        ? [
            {
              label: single ? 'Download' : `Download ${targets.length} files`,
              Icon: Download,
              onSelect: () => downloadFiles(targets),
            },
          ]
        : []),
      ...(single
        ? [
            {
              label: 'Rename',
              Icon: Pencil,
              hint: 'F2',
              onSelect: () => setDialog({ type: 'rename', item: single }),
            },
          ]
        : []),
      {
        label: single ? 'Move to…' : `Move ${targets.length} items…`,
        Icon: FolderInput,
        onSelect: () => setDialog({ type: 'move', items: targets }),
      },
      { label: 'Share', Icon: Share2, disabled: true, hint: 'Soon', onSelect: () => {} },
      { separator: true },
      {
        label: 'Move to trash',
        Icon: Trash2,
        danger: true,
        hint: 'Del',
        onSelect: () => trash(targets),
      },
    ];
  };

  const handlersFor = (item) => ({
    onSelect: (event) =>
      selection.click(keyOf(item), {
        toggle: event.ctrlKey || event.metaKey,
        range: event.shiftKey,
      }),
    onToggle: (range) => selection.toggle(keyOf(item), range),
    onOpen: () => open(item),
    onContextMenu: (event) => {
      event.preventDefault(); // our menu instead of the browser's
      const targets = targetsFor(item);
      if (!selection.isSelected(keyOf(item))) selection.selectOnly(keyOf(item));
      setContextMenu({ x: event.clientX, y: event.clientY, targets });
    },
  });

  // Keyboard shortcuts. Re-subscribed every render (cheap), so they always see the
  // current selection without a stale closure.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTyping(event.target)) return;
      // A dialog or menu is open: its own keys win.
      if (document.querySelector('dialog[open], [role="menu"]')) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        if (allItems.length === 0) return;
        event.preventDefault(); // instead of selecting all text on the page
        selection.selectAll();
      } else if (event.key === 'Escape' && selectedItems.length > 0) {
        selection.clear();
      } else if (event.key === 'Delete' && selectedItems.length > 0) {
        event.preventDefault();
        trash(selectedItems);
      } else if (event.key === 'F2' && selectedItems.length === 1) {
        event.preventDefault();
        setDialog({ type: 'rename', item: selectedItems[0] });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const itemProps = {
    isSelected: (item) => selection.isSelected(keyOf({ ...item, kind: 'file' })),
    selectionActive: selectedItems.length > 0,
    handlersFor: (file) => handlersFor({ ...file, kind: 'file' }),
    menuFor: (file) => menuFor(targetsFor({ ...file, kind: 'file' })),
  };

  return (
    <>
      <div className="mt-4">
        {selectedItems.length > 0 ? (
          <SelectionToolbar
            count={selectedItems.length}
            onClear={selection.clear}
            onRename={() => setDialog({ type: 'rename', item: selectedItems[0] })}
            onMove={() => setDialog({ type: 'move', items: selectedItems })}
            onTrash={() => trash(selectedItems)}
            onDownload={onlyFiles(selectedItems) ? () => downloadFiles(selectedItems) : undefined}
          />
        ) : (
          toolbar
        )}
      </div>

      <div className="mt-6 min-h-64 space-y-8">
        {placeholder ?? (
          <>
            {folderItems.length > 0 && (
              <section aria-labelledby="folders-heading">
                <h2 id="folders-heading" className="mb-3 text-sm font-medium text-fg-muted">
                  Folders
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {folderItems.map((folder) => (
                    <li key={folder.id} className="min-w-0">
                      <FolderCard
                        folder={folder}
                        selected={selection.isSelected(keyOf(folder))}
                        selectionActive={selectedItems.length > 0}
                        handlers={handlersFor(folder)}
                        menuItems={menuFor(targetsFor(folder))}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {fileItems.length > 0 && (
              <section aria-labelledby="files-heading">
                <h2 id="files-heading" className="mb-3 text-sm font-medium text-fg-muted">
                  Files
                </h2>
                {viewMode === 'list' ? (
                  <FileTable files={files} {...itemProps} />
                ) : (
                  <FileGrid files={files} {...itemProps} />
                )}
                {filesFooter}
              </section>
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Item actions"
          items={menuFor(contextMenu.targets)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ← → step through the files in this list, in the order shown. */}
      <PreviewModal
        files={files}
        fileId={previewId}
        onClose={() => setPreviewId(null)}
        onNavigate={setPreviewId}
      />
      <RenameDialog
        item={dialog?.type === 'rename' ? dialog.item : null}
        onClose={() => setDialog(null)}
      />
      <MoveDialog
        items={dialog?.type === 'move' ? dialog.items : null}
        currentFolderId={currentFolderId}
        onClose={() => setDialog(null)}
        onMove={async (destination) => {
          await actions.move(dialog.items, destination);
          setDialog(null);
          selection.clear();
        }}
      />
    </>
  );
}
