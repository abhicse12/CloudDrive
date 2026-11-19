import { Link } from 'react-router';
import { FileIcon } from './FileIcon.jsx';

/** Compact "pill" card for a folder; opens it. */
export function FolderCard({ folder }) {
  return (
    <Link
      to={`/app/files/${folder.id}`}
      title={folder.name}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm transition-colors hover:border-brand-300 hover:bg-surface-muted dark:hover:border-brand-500/40"
    >
      <FileIcon folder size="sm" />
      <span className="truncate text-sm font-medium">{folder.name}</span>
    </Link>
  );
}
