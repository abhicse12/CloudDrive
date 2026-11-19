import { useEffect, useRef } from 'react';

/**
 * The list part of a menu, with the keyboard behaviour screen-reader users expect
 * (WAI-ARIA "menu" pattern):
 *   ↑ ↓      move between items (wrapping), skipping disabled ones
 *   Home End first / last item
 *   Enter    activate (native <button> behaviour)
 *   Esc Tab  close
 * Focus moves into the menu when it opens, so the keyboard works immediately.
 *
 * items: [{ label, Icon?, onSelect, disabled?, danger?, hint? } | { separator: true }]
 * Used by DropdownMenu (a button opens it) and, in U4, the right-click menu.
 */
export function MenuList({ items, onClose, id, labelledBy, className = '', style }) {
  const listRef = useRef(null);

  const enabledButtons = () => [
    ...listRef.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])'),
  ];

  useEffect(() => {
    listRef.current.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, []);

  const moveFocus = (getIndex) => {
    const buttons = enabledButtons();
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement);
    buttons[getIndex(current, buttons.length)].focus();
  };

  const onKeyDown = (event) => {
    const actions = {
      ArrowDown: () => moveFocus((i, n) => (i + 1) % n),
      ArrowUp: () => moveFocus((i, n) => (i - 1 + n) % n),
      Home: () => moveFocus(() => 0),
      End: () => moveFocus((_i, n) => n - 1),
      Escape: () => onClose({ restoreFocus: true }),
      Tab: () => onClose({ restoreFocus: false }),
    };
    const action = actions[event.key];
    if (!action) return;
    if (event.key !== 'Tab') event.preventDefault();
    action();
  };

  return (
    <div
      ref={listRef}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      style={style}
      className={`z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-lg ${className}`}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              if (item.disabled) return;
              onClose({ restoreFocus: true });
              item.onSelect();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none focus:bg-surface-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${
              item.danger ? 'text-danger' : 'text-fg'
            } hover:bg-surface-muted`}
          >
            {item.Icon && <item.Icon className="size-4 shrink-0" aria-hidden="true" />}
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="text-xs text-fg-subtle">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
