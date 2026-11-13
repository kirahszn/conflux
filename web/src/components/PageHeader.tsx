/** Dashboard page header: small eyebrow, compact title, one-line description, optional actions. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: React.ReactNode; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-green">{eyebrow}</p>}
        <h1 className="mt-1.5 text-[clamp(1.4rem,1.2rem+0.8vw,1.75rem)] font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Standard page body wrapper inside the app shell. */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>;
}
