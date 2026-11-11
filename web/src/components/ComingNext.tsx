import Link from "next/link";

export function ComingNext({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-24 text-center sm:px-6">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green-ink">{eyebrow}</p>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{body}</p>
      <span className="mt-8 inline-flex rounded-full bg-green-soft px-4 py-1.5 text-sm font-semibold text-green-ink">Coming next</span>
      <div className="mt-10 flex justify-center gap-3">
        <Link href="/" className="rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold hover:border-fg">
          Back home
        </Link>
        <Link href="/agents" className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-white hover:bg-fg-2">
          Meet the agents
        </Link>
      </div>
    </section>
  );
}
