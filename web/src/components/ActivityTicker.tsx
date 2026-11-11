"use client";
import { useEffect, useMemo, useState } from "react";
import { activity, timeAgo, type ActivityEvent } from "@/lib/feed";
import { roleVars } from "@/lib/roles";
import { useChainData } from "@/lib/useChainData";

const ICON: Record<ActivityEvent["kind"], string> = {
  created: "◆",
  submitted: "▲",
  settled: "✓",
  paid: "+",
  expired: "○",
  cancelled: "×",
};

/** Thin scrolling ticker of real events derived from the contract's task records, newest first. */
export function ActivityTicker() {
  const { data, retry } = useChainData();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const events = useMemo(
    () => (data.state === "ready" ? activity(data.agents, data.tasks, data.coordinator).slice(0, 24) : []),
    [data],
  );

  return (
    <div className="border-y border-line bg-surface">
      <div className="flex h-11 items-center">
        <span className="z-10 flex h-full shrink-0 items-center gap-2 border-r border-line bg-surface px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
          <span className="live-dot h-2 w-2 rounded-full bg-green" aria-hidden />
          Live
        </span>
        {data.state === "loading" && (
          <div className="flex flex-1 gap-6 px-4" aria-busy>
            {[180, 220, 160, 200].map((w, i) => (
              <span key={i} className="skeleton h-3" style={{ width: w }} />
            ))}
          </div>
        )}
        {data.state === "error" && (
          <p role="alert" className="flex-1 truncate px-4 text-xs text-bad">
            Couldn&apos;t read activity from the contract.{" "}
            <button onClick={retry} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </p>
        )}
        {data.state === "ready" && events.length === 0 && <p className="px-4 text-xs text-muted">No activity yet. The first task will show up here.</p>}
        {events.length > 0 && (
          <div className="marquee h-full min-w-0 flex-1" role="region" aria-label="Recent activity, newest first">
            <ul className="marquee-track h-full items-center" style={{ "--marquee-dur": `${events.length * 6}s` } as React.CSSProperties}>
              {[0, 1].map((copy) =>
                events.map((e) => (
                  <li key={`${copy}-${e.key}`} className={`shrink-0 ${copy ? "marquee-dup" : ""}`} aria-hidden={copy ? true : undefined}>
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noreferrer"
                      tabIndex={copy ? -1 : undefined}
                      className="group flex items-center gap-2 whitespace-nowrap px-5 text-[13px] text-fg-2 hover:text-fg"
                    >
                      <span
                        style={roleVars(e.role)}
                        className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${e.kind === "paid" || e.kind === "settled" ? "bg-green-soft text-green-ink" : "role-tag"}`}
                        aria-hidden
                      >
                        {ICON[e.kind]}
                      </span>
                      <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-green">{e.text}</span>
                      {e.at && now !== null && <span className="font-mono text-[11px] text-faint">{timeAgo(e.at, now)}</span>}
                      <span className="pl-3 text-line-strong" aria-hidden>
                        /
                      </span>
                    </a>
                  </li>
                )),
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
