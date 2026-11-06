import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Music,
  Search,
  Video,
} from 'lucide-react';

const FOLDERS = ['Documents', 'Photos', 'Trips', 'Music'];

const FILES = [
  { name: 'Specification.pdf', Icon: FileText, color: 'text-rose-500 bg-rose-500/10' },
  { name: 'Sicily.mp4', Icon: Video, color: 'text-amber-500 bg-amber-500/10' },
  { name: 'DSC03877.jpg', Icon: ImageIcon, color: 'text-emerald-500 bg-emerald-500/10' },
  { name: 'Budget-2026.xlsx', Icon: FileSpreadsheet, color: 'text-green-600 bg-green-600/10' },
  { name: 'BlueRiver.mp3', Icon: Music, color: 'text-sky-500 bg-sky-500/10' },
  { name: 'Archive.zip', Icon: FileArchive, color: 'text-violet-500 bg-violet-500/10' },
];

/**
 * A miniature, non-interactive drawing of the app, built from HTML instead of a
 * screenshot: no image to download, sharp on every screen, and it follows dark mode.
 */
export function ProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto max-w-5xl rounded-2xl border border-border bg-surface/80 p-2 shadow-2xl shadow-brand-900/10 backdrop-blur"
    >
      <div className="flex overflow-hidden rounded-xl border border-border bg-canvas">
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-border bg-surface p-3 sm:flex">
          {['Dashboard', 'My Files', 'Shared', 'Trash'].map((item, i) => (
            <span
              key={item}
              className={`rounded-md px-2.5 py-1.5 text-xs ${
                i === 1
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-fg-muted'
              }`}
            >
              {item}
            </span>
          ))}
          <div className="mt-auto rounded-lg border border-border p-2.5">
            <div className="flex justify-between text-[10px] text-fg-muted">
              <span>Storage</span>
              <span>38%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
              <div className="h-full w-[38%] rounded-full bg-brand-600" />
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">My Files</span>
            <span className="ml-auto flex h-7 w-40 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[10px] text-fg-subtle">
              <Search className="size-3" /> Search files
            </span>
            <span className="h-7 rounded-md bg-brand-600 px-3 text-[10px] leading-7 font-medium text-white">
              + New
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FOLDERS.map((folder) => (
              <span
                key={folder}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-[11px] font-medium"
              >
                <Folder className="size-4 fill-brand-200 text-brand-500 dark:fill-brand-500/30" />
                {folder}
              </span>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {FILES.map(({ name, Icon, color }) => (
              <span
                key={name}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <span className={`grid size-9 place-items-center rounded-lg ${color}`}>
                  <Icon className="size-5" />
                </span>
                <span className="w-full truncate text-center text-[10px] text-fg-muted">
                  {name}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
