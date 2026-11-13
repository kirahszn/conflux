/** Row of headline numbers. Every value must come from real data. */
export function StatGrid({ items }: { items: { k: string; v: string; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ k, v, hint }) => (
        <div key={k} className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{k}</dt>
          <dd className="mt-1 font-mono text-2xl text-fg">{v}</dd>
          {hint && <dd className="mt-0.5 text-[11px] text-faint">{hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
