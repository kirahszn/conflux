"use client";
// Contributions: every slot an agent submitted on chain (result_hash set), newest first.
import Link from "next/link";
import { useMemo, useState } from "react";
import { parseProofRef } from "@/lib/live";
import { formatNear, nsToDate, type Agent, type Task } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { shortenAccount } from "../Account";
import { StatGrid } from "../StatGrid";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag } from "../Tags";
import { VerifyBadge } from "../VerifyBadge";
import { ContributionFlow } from "./ContributionFlow";
import { useSlotVerifications } from "@/lib/useSlotVerifications";

export interface Contribution {
  task: Task;
  index: number;
  role: string;
  agentId: string;
  reward: bigint;
  resultHash: string;
  submittedAt: string;
  proofRef: string | null;
}
export type Payment = "paid" | "pending";
/** Submitted slots are paid when the task settles or expires; until then the reward stays in escrow. */
export const payment = (t: Task): Payment => (t.status === "Settled" || t.status === "Expired" ? "paid" : "pending");
export const PAYMENT_LABEL: Record<Payment, string> = { paid: "Paid", pending: "In escrow" };

export function contributionsOf(tasks: Task[]): Contribution[] {
  return tasks
    .flatMap((task) =>
      task.slots.flatMap((s, index) =>
        s.result_hash && s.agent_id && s.submitted_at
          ? [{ task, index, role: s.role, agentId: s.agent_id, reward: BigInt(s.reward), resultHash: s.result_hash, submittedAt: s.submitted_at, proofRef: s.proof_ref }]
          : [],
      ),
    )
    .sort((a, b) => (BigInt(b.submittedAt) > BigInt(a.submittedAt) ? 1 : -1));
}

const when = (ns: string) => nsToDate(ns).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const href = (c: Contribution) => `/contributions/${c.task.id}/${c.index}`;

export function ContributionsTable() {
  const { data, retry } = useChainData({ refreshMs: 15_000 });
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const all = useMemo(() => (data.state === "ready" ? contributionsOf(data.tasks) : []), [data]);
  const agents = useMemo(() => new Map<string, Agent>(data.state === "ready" ? data.agents.map((a) => [a.agent_id, a]) : []), [data]);
  const contributors = useMemo(() => [...new Set(all.map((c) => c.agentId))], [all]);
  const rows = agentFilter === "all" ? all : all.filter((c) => c.agentId === agentFilter);
  const verification = useSlotVerifications(data.state === "ready" ? data.tasks : []);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading") {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const paid = all.filter((c) => payment(c.task) === "paid");
  const proven = all.filter((c) => parseProofRef(c.proofRef)).length;

  return (
    <div className="space-y-4">
      <StatGrid
        items={[
          { k: "Submitted", v: String(all.length), hint: `across ${new Set(all.map((c) => c.task.id)).size} tasks` },
          { k: "Paid", v: String(paid.length), hint: `${formatNear(paid.reduce((s, c) => s + c.reward, 0n))} NEAR` },
          { k: "In escrow", v: String(all.length - paid.length), hint: "waiting for settlement" },
          { k: "With proof", v: String(proven), hint: "signed inference reference on chain" },
        ]}
      />

      {data.coordinator !== undefined && <ContributionFlow tasks={data.tasks} agents={data.agents} coordinator={data.coordinator} />}

      {all.length === 0 ? (
        <EmptyState title="No contributions yet.">
          An agent&apos;s work shows here once it submits a signed result for a task. <Link href="/tasks/new" className="text-green underline underline-offset-2">Create a task</Link>.
        </EmptyState>
      ) : (
        <div className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2" role="tablist" aria-label="Filter by agent">
            {["all", ...contributors].map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={agentFilter === id}
                onClick={() => setAgentFilter(id)}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${agentFilter === id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
              >
                {id === "all" ? "All agents" : (agents.get(id)?.name ?? shortenAccount(id, 20))}
                <span className="ml-1.5 font-mono text-[11px] text-faint">{id === "all" ? all.length : all.filter((c) => c.agentId === id).length}</span>
              </button>
            ))}
          </div>

          <ul className="divide-y divide-line md:hidden">
            {rows.map((c) => {
              const proof = parseProofRef(c.proofRef);
              return (
                <li key={href(c)}>
                  <Link href={href(c)} className="block px-4 py-3 hover:bg-surface-2/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleTag role={c.role} />
                      <span className="font-medium">{agents.get(c.agentId)?.name ?? shortenAccount(c.agentId, 24)}</span>
                    </div>
                    <p className="mt-1 text-sm text-fg-2">
                      <span className="font-mono text-faint">#{c.task.id}</span> {c.task.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{when(c.submittedAt)}</span>
                      <span className="font-mono">{c.resultHash.slice(0, 10)}…</span>
                      {proof && <span className="font-mono">{proof.kind}</span>}
                      <PayCell c={c} />
                    </div>
                    <div className="mt-2">
                      <VerifyBadge s={verification(c.task.id, c.index)} compact />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Contribution</th>
                  <th className="px-3 py-2.5 font-semibold">Task</th>
                  <th className="px-3 py-2.5 font-semibold">Proof</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">result_hash</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Reward</th>
                  <th className="px-4 py-2.5 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const proof = parseProofRef(c.proofRef);
                  return (
                    <tr key={href(c)} className="group hover:bg-surface-2/60">
                      <td className="px-4 py-2">
                        <Link href={href(c)} className="flex min-h-11 flex-col justify-center gap-1">
                          <RoleTag role={c.role} className="self-start" />
                          <span className="font-medium text-fg group-hover:text-green">{agents.get(c.agentId)?.name ?? shortenAccount(c.agentId, 24)}</span>
                        </Link>
                      </td>
                      <td className="max-w-64 px-3 py-2">
                        <Link href={`/tasks/${c.task.id}`} className="flex min-h-11 items-center text-fg-2 hover:text-green">
                          <span>
                            <span className="font-mono text-faint">#{c.task.id}</span> {c.task.title}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-2">
                        <div className="mb-1 font-sans">
                          <VerifyBadge s={verification(c.task.id, c.index)} compact />
                        </div>
                        {proof ? (
                          <>
                            {proof.kind}
                            <div className="text-[11px] text-faint">{proof.model.split("/").pop()}</div>
                          </>
                        ) : (
                          <span className="text-faint">none</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-muted lg:table-cell" title={c.resultHash}>
                        {c.resultHash.slice(0, 12)}…
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="font-mono">{formatNear(c.reward)}</span>
                        <div className="text-[11px]"><PayCell c={c} /></div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{when(c.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-faint">Read live from the contract. Updated {data.loadedAt.toLocaleTimeString()}.</p>
    </div>
  );
}

function PayCell({ c }: { c: Contribution }) {
  const p = payment(c.task);
  return <span className={p === "paid" ? "text-green" : "text-[#f0b429]"}>{PAYMENT_LABEL[p]}</span>;
}
