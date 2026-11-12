import Link from "next/link";
import { Page, PageHeader } from "./PageHeader";

/** Placeholder for a dashboard page that lands in a later step. */
export function ComingNext({ eyebrow, title, body, step }: { eyebrow: string; title: string; body: string; step?: string }) {
  return (
    <Page>
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface/60 p-8 text-center">
        <span className="inline-flex rounded-full bg-green-soft px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-green">
          Coming next{step ? `: ${step}` : ""}
        </span>
        <p className="mx-auto mt-4 max-w-lg text-sm text-fg-2">{body}</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-medium text-fg-2 hover:border-fg hover:text-fg">
          Back to Overview
        </Link>
      </div>
    </Page>
  );
}
