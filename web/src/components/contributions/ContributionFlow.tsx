"use client";
// How contributions become the result, for one task: agent reports (each verified) -> the signed
// synthesis -> final_report_hash on chain -> approval -> settlement payouts. Every box is real data.
// There is no voting or scoring: the synthesis reads all reports and keeps disagreements visible.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { explorer } from "@/config/network";
import { closingTxs, type FoundTx } from "@/lib/history";
import { taskPayouts } from "@/lib/live";
import { formatNear, type Agent, type Task } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { useCoordTask } from "@/lib/useCoordTask";
import { shortenAccount } from "../Account";
import { RoleTag, StatusPill } from "../Tags";
import { VerifyBadge, verifyState } from "../VerifyBadge";

const CLOSED_BY: Record<string, string> = { approve_task: "Approved by the creator", release_payment: "Released after review", expire_task: "Expired by the creator", cancel_task: "Cancelled" };

export function ContributionFlow({ tasks, agents, coordinator }: { tasks: Task[]; agents: Agent[]; coordinator: string }) {
  const withWork = useMemo(() => tasks.filter((t) => t.slots.some((s) => s.result_hash)).sort((a, b) => b.id - a.id), [tasks]);
  const [picked, setPicked] = useState<number | null>(null);
  const task = withWork.find((t) => t.id === picked) ?? withWork[0] ?? null;
  if (!task) return null;
  return (
    <section aria-labelledby="flow" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 id="flow" className="text-sm font-semibold">How contributions become the result</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          Task
          <select value={task.id} onChange={(e) => setPicked(Number(e.target.value))} className="min-h-11 rounded-lg border border-line-strong bg-bg px-2 text-sm text-fg">
            {withWork.map((t) => (
              <option key={t.id} value={t.id}>#{t.id} {t.title.length > 40 ? `${t.title.slice(0, 39)}…` : t.title}</option>
            ))}
          </select>
        </label>
      </div>
      <FlowFor key={task.id} task={task} agents={agents} coordinator={coordinator} />
    </section>
  );
}

function FlowFor({ task, agents, coordinator }: { task: Task; agents: Agent[]; coordinator: string }) {
  const coord = useCoordTask(task);
  const view = coord.state === "ready" ? coord.view : null;
  const byId = useMemo(() => new Map(agents.map((a) => [a.agent_id, a])), [agents]);
  const [closing, setClosing] = useState<FoundTx | null>(null);
  useEffect(() => {
    let alive = true;
    closingTxs([task]).then((m) => alive && setClosing(m.get(task.id) ?? null)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [task]);
  const pays = taskPayouts(task, byId, coordinator);

  return (
    <ol className="grid gap-px bg-line lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr]">
      <Step n={1} title="Agent reports" note="Each agent signed its own submission">
        <ul className="space-y-2">
          {task.slots.map((s, i) => (
            <li key={i} style={roleVars(s.role)} className="border-l-2 border-[var(--role-solid)] pl-2.5">
              <Link href={s.result_hash ? `/contributions/${task.id}/${i}` : `/tasks/${task.id}`} className="flex min-h-11 flex-col justify-center hover:text-green">
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-fg-2">
                  <RoleTag role={s.role} />
                  {s.agent_id ? (byId.get(s.agent_id)?.name ?? shortenAccount(s.agent_id, 20)) : "unassigned"}
                </span>
                <span className="font-mono text-[11px] text-faint">{s.result_hash ? `result ${s.result_hash.slice(0, 10)}…` : "not submitted"}</span>
              </Link>
              {s.result_hash && <VerifyBadge s={verifyState(coord, view?.slotVerification[i])} compact />}
            </li>
          ))}
        </ul>
      </Step>
      <Step n={2} title="Signed synthesis" note="The coordinator reads every report. No voting: disagreements stay in the text">
        {task.final_report_hash ? (
          <>
            <VerifyBadge s={verifyState(coord, view?.synthVerification)} compact />
            <p className="mt-2 text-xs text-muted">One NEAR AI call, signed. Its exact text is inside the final report.</p>
          </>
        ) : (
          <p className="text-xs text-muted">{task.status === "Submitted" ? "Being written now." : "Not written. The task did not reach aggregation."}</p>
        )}
      </Step>
      <Step n={3} title="Final report hash" note="Recorded on chain by the coordinator">
        {task.final_report_hash ? (
          <>
            <p className="break-all font-mono text-[11px] text-fg-2">{task.final_report_hash}</p>
            {view?.reportVerified === true && <p className="mt-1 text-xs text-green">matches the report text ✓</p>}
            {view?.reportVerified === false && <p className="mt-1 text-xs text-bad">does not match the served report</p>}
            {view?.task.final_report?.tx && <Tx hash={view.task.final_report.tx} />}
          </>
        ) : (
          <p className="text-xs text-muted">None yet.</p>
        )}
      </Step>
      <Step n={4} title="Approval" note="A human decides, or the 24 hour review ends">
        <StatusPill status={task.status} />
        {closing ? (
          <>
            <p className="mt-2 text-xs text-fg-2">{CLOSED_BY[closing.method ?? ""] ?? "Closed"}</p>
            <Tx hash={closing.hash} />
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">{task.status === "Submitted" ? "Waiting for the creator." : task.status === "Settled" || task.status === "Expired" ? "Closing transaction not found automatically." : "Not yet."}</p>
        )}
      </Step>
      <Step n={5} title="Settlement" note="Paid by the contract to each owner">
        {pays.length ? (
          <ul className="space-y-1">
            {pays.map((p) => (
              <li key={`${p.to}-${p.label}-${p.role}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-mono text-fg-2" title={p.to}>{shortenAccount(p.to, 20)}</span>
                <span className={`shrink-0 font-mono ${p.label === "Refund to creator" ? "text-fg-2" : "text-green"}`}>+{formatNear(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">{formatNear(task.escrow)} NEAR still in escrow.</p>
        )}
      </Step>
    </ol>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <li className="relative min-w-0 bg-surface p-4">
      <p className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-faint">{n}</span>
        <span className="text-sm font-semibold text-fg">{title}</span>
        {n < 5 && <span className="ml-auto text-faint lg:hidden" aria-hidden>↓</span>}
        {n < 5 && <span className="ml-auto hidden text-faint lg:inline" aria-hidden>→</span>}
      </p>
      <p className="mb-3 mt-0.5 text-[11px] leading-snug text-faint">{note}</p>
      {children}
    </li>
  );
}

function Tx({ hash }: { hash: string }) {
  return (
    <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono text-[11px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
      tx {hash.slice(0, 8)}… ↗
    </a>
  );
}
