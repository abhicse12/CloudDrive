import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';

// Clicks on these controls must not also count as a click on the card around them
// (which would change the selection).
const stop = (event) => event.stopPropagation();

/**
 * The real checkbox on every item: keyboard users Tab to it and press Space, screen
 * readers announce "Select report.pdf, checkbox, checked". Hidden until hover/focus
 * unless something is selected, so the grid stays calm.
 */
export function SelectCheckbox({ name, checked, alwaysVisible, onToggle }) {
  return (
    <input
      type="checkbox"
      aria-label={`Select ${name}`}
      checked={checked}
      // The logic runs in onClick, which knows about Shift (range); onChange can't.
      onChange={() => {}}
      onClick={(event) => {
        stop(event);
        onToggle(event.shiftKey);
      }}
      className={`size-4 shrink-0 cursor-pointer rounded accent-brand-600 transition-opacity focus:opacity-100 ${
        checked || alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    />
  );
}

/** The ⋯ button with the item's actions. */
export function ItemMenu({ name, items }) {
  return (
    <div onClick={stop} onDoubleClick={stop} onContextMenu={stop} className="shrink-0">
      <DropdownMenu
        label={`Actions for ${name}`}
        trigger={<MoreHorizontal className="size-4" aria-hidden="true" />}
        items={items}
      />
    </div>
  );
}
