/** One divided strip of headline numbers (not four separate cards). Every value must be real. */
export function StatGrid({ items }: { items: { k: string; v: string; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
      {items.map(({ k, v, hint }) => (
        <div key={k} className="min-w-0 bg-surface px-4 py-3.5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{k}</dt>
          <dd className="mt-1 font-mono text-xl text-fg">{v}</dd>
          {hint && <dd className="mt-0.5 text-[11px] text-faint">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
