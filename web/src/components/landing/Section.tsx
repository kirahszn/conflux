import type { Showcase } from "@/lib/showcase";
import { Reveal } from "../Reveal";

/** One landing section: label, headline, one-line caption of real data, and a visual. Alternates sides on desktop. */
export function Section({
  n,
  label,
  title,
  caption,
  source,
  flip = false,
  children,
}: {
  n: string;
  label: string;
  title: string;
  caption: React.ReactNode;
  source?: Showcase["source"];
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-[0.9fr_1.1fr] md:gap-16 md:py-28">
      <div className={flip ? "md:order-2" : ""}>
        <div className="rv flex flex-wrap items-center gap-2" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green-ink">
            {n} · {label}
          </span>
          {source && <SourceTag source={source} />}
        </div>
        <h2 className="rv mt-4 font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl" style={{ "--i": 1 } as React.CSSProperties}>
          {title}
        </h2>
        <p className="rv mt-5 max-w-md text-base leading-relaxed text-muted" style={{ "--i": 2 } as React.CSSProperties}>
          {caption}
        </p>
      </div>
      <div className={`rv min-w-0 ${flip ? "md:order-1" : ""}`} style={{ "--i": 2 } as React.CSSProperties}>
        {children}
      </div>
    </Reveal>
  );
}

export function SourceTag({ source }: { source: Showcase["source"] }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted"
      title={source === "live" ? "Read live from the coordinator API" : "Saved snapshot of real task data (src/data/task3.json)"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${source === "live" ? "bg-green" : "bg-line-strong"}`} aria-hidden />
      From task #3{source === "live" ? ", live" : ""}
    </span>
  );
}
