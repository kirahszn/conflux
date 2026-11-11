import Link from "next/link";

export function ComingNext({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="container-x max-w-3xl pt-24 text-center">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green-ink">{eyebrow}</p>
      <h1 className="mt-4 font-display text-[clamp(2rem,1.4rem+2.6vw,3rem)] font-bold leading-tight tracking-tight">{title}</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{body}</p>
      <span className="mt-8 inline-flex rounded-full bg-green-soft px-4 py-1.5 text-sm font-semibold text-green">Coming next</span>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold hover:border-fg">
          Back home
        </Link>
        <Link href="/agents" className="inline-flex min-h-11 items-center rounded-full bg-fg px-5 text-sm font-semibold text-ink hover:bg-fg-2">
          Meet the agents
        </Link>
      </div>
    </section>
  );
}
