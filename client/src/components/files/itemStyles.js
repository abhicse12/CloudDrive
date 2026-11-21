/** Ring + tint on selected items: one look for cards and rows. */
export const selectedStyle = (selected) =>
  selected
    ? 'border-brand-500 bg-brand-50/70 ring-1 ring-brand-500 dark:bg-brand-500/10'
    : 'border-border bg-surface hover:bg-surface-muted';
