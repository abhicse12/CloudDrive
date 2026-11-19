import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { dismissToast, toastStore } from './toast.js';

const VARIANTS = {
  success: { Icon: CheckCircle2, tone: 'text-success' },
  error: { Icon: AlertCircle, tone: 'text-danger' },
  info: { Icon: Info, tone: 'text-brand-600 dark:text-brand-300' },
};

/**
 * Renders the toasts, bottom-right. Mounted once, in AppLayout.
 * The container is an ARIA live region: screen readers announce each new toast
 * without moving the user's focus away from what they were doing.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map(({ id, variant, message, action }) => {
        const { Icon, tone } = VARIANTS[variant];
        return (
          <div
            key={id}
            role={variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-sm shadow-lg"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-fg">{message}</p>
            {action && (
              <button
                type="button"
                onClick={() => {
                  dismissToast(id);
                  action.onClick();
                }}
                className="shrink-0 font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                {action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(id)}
              aria-label="Dismiss notification"
              className="-m-1 shrink-0 rounded p-1 text-fg-subtle hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
