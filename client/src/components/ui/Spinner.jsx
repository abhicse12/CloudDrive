import { Loader2 } from 'lucide-react';
import { Logo } from './Logo.jsx';

export function Spinner({ className = 'size-5', label = 'Loading' }) {
  return (
    <Loader2
      className={`animate-spin text-brand-600 ${className}`}
      role="status"
      aria-label={label}
    />
  );
}

/** Shown while the app checks whether the user is logged in. */
export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Logo showText={false} />
        <Spinner />
      </div>
    </div>
  );
}
