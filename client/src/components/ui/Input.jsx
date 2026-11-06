import { useId } from 'react';

const inputClasses =
  'block h-10 w-full rounded-lg border bg-surface px-3 text-sm text-fg shadow-sm transition-colors ' +
  'placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Labelled text input with an error message, wired up for screen readers:
 * aria-invalid marks the field as wrong, aria-describedby reads the error/hint aloud.
 * `ref` is forwarded automatically in React 19 (React Hook Form needs it).
 */
export function Input({ label, error, hint, className = '', ref, children, ...props }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={`${inputClasses} ${
            error ? 'border-danger focus:border-danger' : 'border-border focus:border-brand-500'
          } ${children ? 'pr-10' : ''}`}
          {...props}
        />
        {children}
      </div>
      {message && (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-fg-subtle'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
