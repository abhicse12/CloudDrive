/**
 * Toast notifications ("File moved to trash · Undo"), callable from anywhere:
 *   toast.success('Moved to trash', { action: { label: 'Undo', onClick: restore } });
 *
 * A tiny store outside React instead of Redux: toasts carry functions (the action's
 * onClick), and Redux state must stay plain data. <Toaster> subscribes with
 * useSyncExternalStore, React's official hook for exactly this.
 */
const DEFAULT_DURATION_MS = 5000;
const MAX_VISIBLE = 4;

let toasts = [];
let nextId = 1;
const listeners = new Set();
const timers = new Map();

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function show(variant, message, { action, duration = DEFAULT_DURATION_MS } = {}) {
  const id = nextId++;
  // New array every change: useSyncExternalStore detects changes by identity.
  toasts = [...toasts, { id, variant, message, action }].slice(-MAX_VISIBLE);
  // Errors stay a little longer: people need time to read what went wrong.
  const ms = variant === 'error' ? duration * 1.6 : duration;
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
  emit();
  return id;
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  info: (message, options) => show('info', message, options),
};

export const toastStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => toasts,
};

/** Tests only: start each test with no toasts and no pending timers. */
export function resetToasts() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  toasts = [];
  emit();
}
