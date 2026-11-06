import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../theme/useTheme.js';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Three-way segmented control: light / dark / follow the OS. */
export function ThemeToggle() {
  const { preference, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`rounded-md p-1.5 transition-colors ${
              active ? 'bg-surface text-brand-600 shadow-sm' : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
