"use client";
// Interim task view (Stage 4.3 step 4): on-chain status and slots, plus whether the coordinator
// has the description and the linked plan. The full Live Execution view (pipeline, agent lanes,
// report, Approve) replaces this in the next step.
import Link from "next/link";
import { useEffect, useState } from "react";
import { explorer } from "@/config/network";
import { COORDINATOR_URL, formatNear, nsToDate } from "@/lib/near";
import { useCoordinatorHealth } from "@/lib/useCoordinatorHealth";
import { useTask } from "@/lib/useChainData";
import { shortenAccount } from "../Account";
import { Page, PageHeader } from "../PageHeader";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";

type CoordInfo = { state: "unknown" } | { state: "offline" } | { state: "ok"; description: boolean; planLinked: boolean };

export function TaskView({ idParam }: { idParam: string }) {
  const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
  const { data } = useTask(id, 5000);
  const health = useCoordinatorHealth();
  const [coord, setCoord] = useState<CoordInfo>({ state: "unknown" });

  useEffect(() => {
    if (id === null || !COORDINATOR_URL || health.state !== "online") {
      if (health.state === "offline") setCoord({ state: "offline" });
      return;
    }
    let alive = true;
    const run = async () => {
      try {
        const t = await fetch(`${COORDINATOR_URL}/tasks/${id}`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : Promise.reject()));
        const p = await fetch(`${COORDINATOR_URL}/tasks/${id}/plan`, { signal: AbortSignal.timeout(5000) });
        if (alive) setCoord({ state: "ok", description: typeof t.description === "string", planLinked: p.ok });
      } catch {
        if (alive) setCoord({ state: "offline" });
      }
    };
    void run();
    const t = setInterval(run, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, health.state]);

  if (id === null) return <Page><EmptyState title="Not a task id." /></Page>;
  if (data.state === "loading") return <Page><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-40 w-full" /></Page>;
  if (data.state === "error") return <Page><ErrorState message={data.message} /></Page>;
  if (data.state === "missing") return <Page><EmptyState title={`Task #${id} does not exist.`}><Link className="text-green underline" href="/tasks">All tasks</Link></EmptyState></Page>;

  const t = data.task;
  return (
    <Page>
      <PageHeader eyebrow={`Task #${t.id}`} title={t.title} description={`Created by ${t.creator}. Read from the contract every 5 seconds.`} actions={<StatusPill status={t.status} />} />
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Escrow", `${formatNear(t.escrow)} NEAR`],
          ["Coordinator fee", `${formatNear(t.coordinator_fee)} NEAR`],
          ["Deadline", nsToDate(t.deadline).toLocaleString()],
          [
            "Coordinator",
            coord.state === "ok"
              ? `${coord.description ? "Description stored" : "No description yet"}${coord.description ? (coord.planLinked ? ", plan linked" : ", no plan linked") : ""}`
              : coord.state === "offline"
                ? "Offline"
                : "Checking…",
          ],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{k}</dt>
            <dd className="mt-1 font-mono text-sm text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface md:hidden">
        {t.slots.map((s, i) => (
          <li key={i} className="space-y-1 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <RoleTag role={s.role} />
              <span className="font-mono">{formatNear(s.reward)} NEAR</span>
            </div>
            <div className="font-mono text-xs">{s.agent_id ? <AgentLink id={s.agent_id} /> : <span className="text-faint">Not assigned</span>}</div>
            <div className="font-mono text-xs">{s.result_hash ? <span className="text-green">submitted {s.result_hash.slice(0, 10)}…</span> : <span className="text-faint">waiting</span>}</div>
          </li>
        ))}
      </ul>
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Slot</th>
              <th className="px-3 py-2.5 font-semibold">Agent</th>
              <th className="px-3 py-2.5 font-semibold">Result</th>
              <th className="px-4 py-2.5 text-right font-semibold">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {t.slots.map((s, i) => (
              <tr key={i}>
                <td className="px-4 py-3"><RoleTag role={s.role} /></td>
                <td className="px-3 py-3 font-mono text-xs">
                  {s.agent_id ? <AgentLink id={s.agent_id} /> : <span className="text-faint">Not assigned</span>}
                </td>
                <td className="px-3 py-3 font-mono text-xs">{s.result_hash ? <span className="text-green">submitted {s.result_hash.slice(0, 10)}…</span> : <span className="text-faint">waiting</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">{formatNear(s.reward)} NEAR</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-faint">The full Live Execution view with the pipeline, agent lanes, final report and Approve is the next step.</p>
    </Page>
  );
}

function AgentLink({ id }: { id: string }) {
  return (
    <a className="inline-flex min-h-11 items-center text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green" href={explorer.account(id)} target="_blank" rel="noreferrer" title={id}>
      {shortenAccount(id, 26)}
    </a>
  );
}
