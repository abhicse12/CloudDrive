import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const STYLES = {
  error: {
    box: 'border-danger/30 bg-danger/5 text-danger',
    Icon: AlertCircle,
    role: 'alert', // announced immediately by screen readers
  },
  success: {
    box: 'border-success/30 bg-success/5 text-success',
    Icon: CheckCircle2,
    role: 'status',
  },
  info: {
    box: 'border-brand-500/30 bg-brand-500/5 text-brand-700 dark:text-brand-300',
    Icon: Info,
    role: 'status',
  },
};

/** Message box for form-level feedback (e.g. "Invalid email or password"). */
export function Alert({ variant = 'error', children, className = '' }) {
  const { box, Icon, role } = STYLES[variant];
  return (
    <div role={role} className={`flex gap-2.5 rounded-lg border p-3 text-sm ${box} ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
