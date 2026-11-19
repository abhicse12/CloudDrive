import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, LayoutGrid, List } from 'lucide-react';
import { CATEGORIES } from '../../components/files/fileCategories.js';
import { DropdownMenu } from '../../components/ui/DropdownMenu.jsx';

const SORT_LABELS = { name: 'Name', createdAt: 'Date added', size: 'Size' };

const chip = (active) =>
  `shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? 'border-brand-600 bg-brand-600 text-white'
      : 'border-border bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg'
  }`;

/** Category filter chips on the left; sort and grid/list on the right. */
export function FilesToolbar({ params, onChange, viewMode, onViewModeChange }) {
  const { category, sortBy, sortOrder } = params;
  const ascending = sortOrder === 'asc';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* A group of toggle buttons; aria-pressed tells screen readers which is on. */}
      <div role="group" aria-label="Filter by type" className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          aria-pressed={!category}
          onClick={() => onChange({ category: null })}
          className={chip(!category)}
        >
          All
        </button>
        {Object.entries(CATEGORIES).map(([key, { label }]) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => onChange({ category: category === key ? null : key })}
            className={chip(category === key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <DropdownMenu
          label={`Sort by ${SORT_LABELS[sortBy]}`}
          triggerClassName="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg"
          trigger={<span>Sort: {SORT_LABELS[sortBy]}</span>}
          items={Object.entries(SORT_LABELS).map(([field, label]) => ({
            label,
            Icon: field === sortBy ? Check : undefined,
            onSelect: () => onChange({ sortBy: field }),
          }))}
        />
        <button
          type="button"
          onClick={() => onChange({ sortOrder: ascending ? 'desc' : 'asc' })}
          aria-label={
            ascending ? 'Sorted ascending. Sort descending' : 'Sorted descending. Sort ascending'
          }
          title={ascending ? 'Ascending' : 'Descending'}
          className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg"
        >
          {ascending ? (
            <ArrowUpNarrowWide className="size-4" aria-hidden="true" />
          ) : (
            <ArrowDownWideNarrow className="size-4" aria-hidden="true" />
          )}
        </button>

        <div
          role="group"
          aria-label="View"
          className="ml-1 flex rounded-lg border border-border bg-surface p-0.5"
        >
          {[
            ['grid', 'Grid view', LayoutGrid],
            ['list', 'List view', List],
          ].map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-label={label}
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              className={`rounded-md p-1.5 ${
                viewMode === mode ? 'bg-surface-muted text-fg' : 'text-fg-subtle hover:text-fg'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
