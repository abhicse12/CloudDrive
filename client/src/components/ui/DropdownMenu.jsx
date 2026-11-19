import { useEffect, useId, useRef, useState } from 'react';
import { MenuList } from './MenuList.jsx';

/**
 * A button that opens a menu below it. Closes on selection, Esc, Tab or a click
 * anywhere outside; after Esc or a selection, focus returns to the button so keyboard
 * users don't get "lost" at the top of the page.
 *
 *   <DropdownMenu label="More actions" trigger={<MoreHorizontal />} items={[...]} />
 *
 * `label` is the accessible name (needed when the trigger is just an icon).
 */
export function DropdownMenu({
  label,
  trigger,
  items,
  align = 'end',
  triggerClassName = 'rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const buttonId = useId();
  const menuId = useId();

  const close = ({ restoreFocus } = {}) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  // Click/tap outside closes it. pointerdown (not click) so it closes before
  // whatever was clicked reacts, like native menus.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        // ↓ on a closed menu button opens it, as in native menus.
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <MenuList
          id={menuId}
          labelledBy={buttonId}
          items={items}
          onClose={close}
          className={`absolute top-full mt-1 ${align === 'end' ? 'right-0' : 'left-0'}`}
        />
      )}
    </div>
  );
}
