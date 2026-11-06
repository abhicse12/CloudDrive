import { Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from './buttonClasses.js';

/**
 * <Button loading> disables itself and shows a spinner, which also prevents
 * double-submitting a form while a request is in flight.
 */
export function Button({
  variant,
  size,
  className,
  loading = false,
  disabled,
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** A link that looks like a button (navigation should be a link, not a button). */
export function ButtonLink({ variant, size, className, ...props }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}
