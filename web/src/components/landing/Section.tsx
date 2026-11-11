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
  band = false,
  children,
}: {
  n: string;
  label: string;
  title: string;
  caption: React.ReactNode;
  source?: Showcase["source"];
  flip?: boolean;
  /** slightly lighter dark-green band behind the section, for rhythm */
  band?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Reveal className={`section-y ${band ? "border-y border-line/60 bg-[#073029]/70" : ""}`}>
      <div className="container-x grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <div className={flip ? "lg:order-2" : ""}>
        <div className="rv flex flex-wrap items-center gap-2" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green">
            {n} · {label}
          </span>
          {source && <SourceTag source={source} />}
        </div>
        <h2 className="rv mt-4 max-w-xl font-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] font-bold leading-[1.12] tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
          {title}
        </h2>
        <p className="rv mt-5 max-w-md text-base leading-relaxed text-fg-2" style={{ "--i": 2 } as React.CSSProperties}>
          {caption}
        </p>
      </div>
      <div className={`rv min-w-0 ${flip ? "lg:order-1" : ""}`} style={{ "--i": 2 } as React.CSSProperties}>
        {children}
      </div>
      </div>
    </Reveal>
  );
}

export function SourceTag({ source }: { source: Showcase["source"] }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[11px] font-medium text-fg-2"
      title={source === "live" ? "Read live from the coordinator API" : "Saved snapshot of real task data (src/data/task3.json)"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${source === "live" ? "bg-green" : "bg-line-strong"}`} aria-hidden />
      From task #3{source === "live" ? ", live" : ""}
    </span>
  );
}
