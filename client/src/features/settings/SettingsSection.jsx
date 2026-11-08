/** Two-column settings block: explanation on the left, the card on the right (stacked on mobile). */
export function SettingsSection({ title, description, children, id }) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-b border-border py-8 first:pt-0 last:border-0 md:grid-cols-[16rem_1fr] md:gap-10"
    >
      <div>
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
    </section>
  );
}
