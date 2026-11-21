import { formatBytes, formatDate } from '../../utils/format.js';
import { FileIcon } from './FileIcon.jsx';
import { ItemMenu, SelectCheckbox } from './ItemControls.jsx';
import { selectedStyle } from './itemStyles.js';
import { categoryLook } from './fileCategories.js';

/**
 * Files as cards or as a table. Both take the same props:
 *   files, isSelected(file), selectionActive, handlersFor(file), menuFor(file)
 * so FileBrowser treats the two views identically.
 */

/** The file name: a button that opens it (preview arrives in U5), or plain text. */
function FileName({ file, onOpen, className }) {
  if (!onOpen) {
    return (
      <span className={className} title={file.name}>
        {file.name}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      title={file.name}
      className={`text-left hover:underline ${className}`}
    >
      {file.name}
    </button>
  );
}

export function FileGrid({ files, isSelected, selectionActive, handlersFor, menuFor }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((file) => {
        const handlers = handlersFor(file);
        const selected = isSelected(file);
        return (
          <li
            key={file.id}
            onClick={handlers.onSelect}
            onDoubleClick={handlers.onOpen}
            onContextMenu={handlers.onContextMenu}
            className={`group relative flex min-w-0 cursor-default flex-col rounded-2xl border p-3 shadow-sm transition-colors select-none ${selectedStyle(selected)}`}
          >
            <div className="absolute top-4 left-4 z-10">
              <SelectCheckbox
                name={file.name}
                checked={selected}
                alwaysVisible={selectionActive}
                onToggle={handlers.onToggle}
              />
            </div>
            <div className="grid aspect-[4/3] place-items-center rounded-xl bg-surface-muted/60">
              <FileIcon category={file.category} size="lg" />
            </div>
            <div className="mt-3 flex min-w-0 items-start gap-1">
              <div className="min-w-0 flex-1">
                <FileName
                  file={file}
                  onOpen={handlers.onOpen}
                  className="block w-full truncate text-sm font-medium"
                />
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {formatBytes(file.size)} · {formatDate(file.createdAt)}
                </p>
              </div>
              <ItemMenu name={file.name} items={menuFor(file)} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FileTable({ files, isSelected, selectionActive, handlersFor, menuFor }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-fg-subtle uppercase">
          <tr>
            <th scope="col" className="w-10 px-4 py-3">
              <span className="sr-only">Select</span>
            </th>
            <th scope="col" className="px-2 py-3 font-medium">
              Name
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
              Type
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Size
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
              Added
            </th>
            <th scope="col" className="w-12 px-2 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {files.map((file) => {
            const handlers = handlersFor(file);
            const selected = isSelected(file);
            return (
              <tr
                key={file.id}
                onClick={handlers.onSelect}
                onDoubleClick={handlers.onOpen}
                onContextMenu={handlers.onContextMenu}
                className={`group cursor-default select-none ${
                  selected ? 'bg-brand-50/70 dark:bg-brand-500/10' : 'hover:bg-surface-muted/60'
                }`}
              >
                <td className="px-4 py-2.5">
                  <SelectCheckbox
                    name={file.name}
                    checked={selected}
                    alwaysVisible={selectionActive}
                    onToggle={handlers.onToggle}
                  />
                </td>
                <td className="max-w-0 px-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileIcon category={file.category} size="sm" />
                    <FileName
                      file={file}
                      onOpen={handlers.onOpen}
                      className="truncate font-medium"
                    />
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 text-fg-muted sm:table-cell">
                  {categoryLook(file.category).singular}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-fg-muted tabular-nums">
                  {formatBytes(file.size)}
                </td>
                <td className="hidden px-4 py-2.5 whitespace-nowrap text-fg-muted md:table-cell">
                  {formatDate(file.createdAt)}
                </td>
                <td className="px-2 py-2.5">
                  <ItemMenu name={file.name} items={menuFor(file)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
