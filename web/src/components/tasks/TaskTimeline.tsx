"use client";
// Activity timeline for one task: only events that happened, in order. Times come from the
// contract (created_at, each slot's submitted_at, the task's submitted_at) or from the confirmed
// closing transaction. Assignment and final-report times are not stored on chain, so they say so.
import Link from "next/link";
import { useEffect, useState } from "react";
import { explorer } from "@/config/network";
import { closingTxs, type FoundTx } from "@/lib/history";
import { formatNear, nsToDate, type Agent, type Task } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { shortenAccount } from "../Account";

type Ev = { key: string; actor: string; text: React.ReactNode; at: Date | null; tx?: string | null; role?: string; href?: string };

const CLOSE_TEXT: Record<string, string> = {
  approve_task: "The creator approved the result. The contract paid every owner and the coordinator fee.",
  release_payment: "Payment released after the 24 hour review period. The contract paid every owner and the fee.",
  expire_task: "The creator expired the task after the deadline. Submitted slots were paid, the rest refunded.",
  cancel_task: "The creator cancelled before any assignment. The escrow was refunded.",
};

export function TaskTimeline({ task, agents, finalTx }: { task: Task; agents: Map<string, Agent>; finalTx: string | null }) {
  const [closing, setClosing] = useState<FoundTx | null | "pending">("pending");
  const closed = task.status === "Settled" || task.status === "Expired" || task.status === "Cancelled";
  useEffect(() => {
    if (!closed) return setClosing(null);
    let alive = true;
    closingTxs([task])
      .then((m) => alive && setClosing(m.get(task.id) ?? null))
      .catch(() => alive && setClosing(null));
    return () => {
      alive = false;
    };
  }, [task, closed]);

  const name = (id: string) => agents.get(id)?.name ?? shortenAccount(id, 24);
  const ev: Ev[] = [
    { key: "c", actor: "Creator", at: nsToDate(task.created_at), text: <>Task created by {shortenAccount(task.creator, 22)}, {formatNear(task.escrow)} NEAR locked in the contract.</> },
  ];
  task.slots.forEach((s, i) => s.agent_id && ev.push({ key: `a${i}`, actor: "Coordinator", at: null, role: s.role, text: <>Assigned {name(s.agent_id)} to the {s.role} role.</> }));
  [...task.slots.map((s, i) => ({ s, i }))]
    .filter(({ s }) => s.submitted_at && s.agent_id)
    .sort((a, b) => (BigInt(a.s.submitted_at!) < BigInt(b.s.submitted_at!) ? -1 : 1))
    .forEach(({ s, i }) => ev.push({ key: `s${i}`, actor: "Agent", at: nsToDate(s.submitted_at!), role: s.role, href: `/contributions/${task.id}/${i}`, text: <>{name(s.agent_id!)} signed and submitted its {s.role} report.</> }));
  if (task.submitted_at) ev.push({ key: "all", actor: "Contract", at: nsToDate(task.submitted_at), text: <>All contributions in. The 24 hour review period started.</> });
  if (task.final_report_hash) ev.push({ key: "f", actor: "Coordinator", at: null, tx: finalTx, text: <>Signed synthesis written. Final report hash {task.final_report_hash.slice(0, 8)}… recorded on chain.</> });
  if (closed && closing && closing !== "pending") ev.push({ key: "x", actor: closing.method === "approve_task" || closing.method === "expire_task" || closing.method === "cancel_task" ? "Creator" : "Anyone", at: nsToDate(closing.ts), tx: closing.hash, text: <>{CLOSE_TEXT[closing.method ?? ""] ?? "Task closed."}</> });
  if (closed && closing === null) ev.push({ key: "x", actor: "Contract", at: null, text: <>Task {task.status.toLowerCase()}. The closing transaction could not be looked up automatically.</> });

  return (
    <section aria-labelledby="timeline" className="rounded-xl border border-line bg-surface">
      <h2 id="timeline" className="border-b border-line px-4 py-3 text-sm font-semibold">Activity</h2>
      <ol className="px-4 py-2">
        {ev.map((e) => (
          <li key={e.key} style={roleVars(e.role)} className="relative border-l border-line pb-1 pl-4 last:border-transparent">
            <span className={`absolute top-3.5 -left-[4.5px] h-2 w-2 rounded-full ${e.role ? "role-bar" : "bg-line-strong"}`} aria-hidden />
            <div className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3 py-1.5">
              <p className="min-w-0 text-sm text-fg-2">
                <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{e.actor}</span>
                {e.href ? <Link href={e.href} className="inline-flex min-h-11 items-center hover:text-green">{e.text}</Link> : e.text}
              </p>
              <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-faint">
                {e.at ? e.at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "time not on chain"}
                {e.tx && (
                  <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
                    {e.tx.slice(0, 8)}… ↗
                  </a>
                )}
              </span>
            </div>
          </li>
        ))}
        {closed && closing === "pending" && <li className="py-2 pl-4 text-xs text-muted">Looking up the closing transaction…</li>}
      </ol>
    </section>
  );
}
