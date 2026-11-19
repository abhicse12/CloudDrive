import { formatBytes, formatDate } from '../../utils/format.js';
import { FileIcon } from './FileIcon.jsx';
import { categoryLook } from './fileCategories.js';

/** Files as cards: big type icon, name, size and date. */
export function FileGrid({ files }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 shadow-sm"
        >
          <div className="grid aspect-[4/3] place-items-center rounded-xl bg-surface-muted/60">
            <FileIcon category={file.category} size="lg" />
          </div>
          <p className="mt-3 truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {formatBytes(file.size)} · {formatDate(file.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Files as a table: easier to scan and compare when there are many. */
export function FileTable({ files }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-fg-subtle uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
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
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {files.map((file) => (
            <tr key={file.id} className="hover:bg-surface-muted/60">
              <td className="max-w-0 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon category={file.category} size="sm" />
                  <span className="truncate font-medium" title={file.name}>
                    {file.name}
                  </span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
