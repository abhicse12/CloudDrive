import { FolderInput, Pencil, Trash2, X } from 'lucide-react';

const action =
  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-muted hover:bg-surface hover:text-fg';

/** Replaces the filter bar while items are selected: "3 selected · Rename · Move · Trash". */
export function SelectionToolbar({ count, onClear, onRename, onMove, onTrash }) {
  return (
    <div
      role="toolbar"
      aria-label="Selected items"
      className="flex min-h-10 flex-wrap items-center gap-1 rounded-xl bg-brand-50 px-2 py-1 dark:bg-brand-500/10"
    >
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="rounded-lg p-1.5 text-fg-muted hover:bg-surface hover:text-fg"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <span className="mr-2 text-sm font-medium" aria-live="polite">
        {count} selected
      </span>
      {count === 1 && (
        <button type="button" onClick={onRename} className={action}>
          <Pencil className="size-4" aria-hidden="true" />
          Rename
        </button>
      )}
      <button type="button" onClick={onMove} className={action}>
        <FolderInput className="size-4" aria-hidden="true" />
        Move
      </button>
      <button type="button" onClick={onTrash} className={`${action} hover:text-danger`}>
        <Trash2 className="size-4" aria-hidden="true" />
        Move to trash
      </button>
    </div>
  );
}
