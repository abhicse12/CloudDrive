/** Eyebrow label + title + intro, shared by every landing section. */
export function SectionHeading({ eyebrow, title, children, id }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-4 text-pretty text-fg-muted">{children}</p>}
    </div>
  );
}
