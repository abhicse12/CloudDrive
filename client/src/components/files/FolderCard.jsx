import { Link } from 'react-router';
import { FileIcon } from './FileIcon.jsx';
import { ItemMenu, SelectCheckbox } from './ItemControls.jsx';
import { selectedStyle } from './itemStyles.js';

/**
 * Compact "pill" card for a folder. Click the card = select; double-click or click
 * the name = open; right-click = menu. (See FileBrowser for what each one does.)
 */
export function FolderCard({ folder, selected, selectionActive, handlers, menuItems }) {
  return (
    <div
      onClick={handlers.onSelect}
      onDoubleClick={handlers.onOpen}
      onContextMenu={handlers.onContextMenu}
      className={`group flex min-w-0 cursor-default items-center gap-2.5 rounded-xl border px-3 py-2 shadow-sm transition-colors select-none ${selectedStyle(selected)}`}
    >
      <SelectCheckbox
        name={folder.name}
        checked={selected}
        alwaysVisible={selectionActive}
        onToggle={handlers.onToggle}
      />
      <FileIcon folder size="sm" />
      <Link
        to={`/app/files/${folder.id}`}
        onClick={(event) => event.stopPropagation()}
        title={folder.name}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {folder.name}
      </Link>
      <ItemMenu name={folder.name} items={menuItems} />
    </div>
  );
}
