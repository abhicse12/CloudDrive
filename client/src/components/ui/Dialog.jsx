import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
  full: 'max-w-5xl',
};

/**
 * Modal dialog built on the browser's native <dialog> + showModal(), which gives us
 * for free: a focus trap (Tab stays inside), Esc to close, an inert page behind it,
 * the top layer (always above everything) and a ::backdrop.
 *
 * React stays in charge: `open` decides whether it shows, and every way of closing
 * (Esc, backdrop click, X button) calls onClose, so state and screen never disagree.
 * Children only render while open, so forms inside start fresh every time.
 *
 * dismissible={false} blocks Esc/backdrop/X, e.g. while a delete request is running.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Esc: the browser would close the <dialog> by itself; we cancel that and let
      // React decide, so `open` stays the single source of truth.
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop, because
      // the content div fills the whole dialog box.
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${SIZES[size]} rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-m-1.5 rounded-lg p-1.5 text-fg-subtle hover:bg-surface-muted hover:text-fg"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
