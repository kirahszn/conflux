"use client";
// Settlements: every closed task with the payouts the contract made, computed from its payout
// rules (lib/live.ts taskPayouts), plus the transaction that closed it when it can be confirmed.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { explorer, network } from "@/config/network";
import { closingTxs, type FoundTx } from "@/lib/history";
import { taskPayouts } from "@/lib/live";
import { formatNear, nsToDate, type Agent, type Task } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { useChainData } from "@/lib/useChainData";
import { shortenAccount } from "../Account";
import { StatGrid } from "../StatGrid";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";

const CLOSED = ["Settled", "Expired", "Cancelled"] as const;
const HOW: Record<string, string> = {
  approve_task: "Approved by the creator",
  release_payment: "Released after the 24 hour review period",
  expire_task: "Expired by the creator after the deadline",
  cancel_task: "Cancelled by the creator before assignment",
};
const when = (ns: string) => nsToDate(ns).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Lookup = { state: "loading" } | { state: "ready"; txs: Map<number, FoundTx> } | { state: "error"; message: string };

export function SettlementsView() {
  const { data, retry } = useChainData({ refreshMs: 15_000 });
  const tasks = data.state === "ready" ? data.tasks : [];
  const closed = useMemo(() => tasks.filter((t) => (CLOSED as readonly string[]).includes(t.status)).sort((a, b) => b.id - a.id), [tasks]);
  const agents = useMemo(() => new Map<string, Agent>(data.state === "ready" ? data.agents.map((a) => [a.agent_id, a]) : []), [data]);
  const closedKey = closed.map((t) => `${t.id}:${t.status}`).join(",");

  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  useEffect(() => {
    if (data.state !== "ready") return;
    let alive = true;
    closingTxs(closed)
      .then((txs) => alive && setLookup({ state: "ready", txs }))
      .catch((e: unknown) => alive && setLookup((l) => (l.state === "ready" ? l : { state: "error", message: e instanceof Error ? e.message : String(e) })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedKey, data.state]);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading") {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Totals, from the same payout rules as each card below.
  let toAgents = 0n, fees = 0n, refunds = 0n;
  for (const t of closed) {
    for (const p of taskPayouts(t, agents, data.coordinator)) {
      if (p.label === "Coordinator fee") fees += p.amount;
      else if (p.label === "Refund to creator") refunds += p.amount;
      else toAgents += p.amount;
    }
  }
  const open = data.tasks.filter((t) => !(CLOSED as readonly string[]).includes(t.status));
  const escrow = open.reduce((s, t) => s + BigInt(t.escrow), 0n);

  return (
    <div className="space-y-4">
      <StatGrid
        items={[
          { k: "Paid to agent owners", v: formatNear(toAgents), hint: "NEAR" },
          { k: "Coordinator fees", v: formatNear(fees), hint: "NEAR" },
          { k: "Refunded to creators", v: formatNear(refunds), hint: "NEAR" },
          { k: "Held in escrow", v: formatNear(escrow), hint: `NEAR in ${open.length} open task${open.length === 1 ? "" : "s"}` },
        ]}
      />

      {open.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Still in escrow</h2>
          <ul className="mt-2 divide-y divide-line">
            {open.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5 hover:text-green">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-mono text-faint">#{t.id}</span> {t.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill status={t.status} />
                    <span className="font-mono text-sm">{formatNear(t.escrow)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closed.length === 0 ? (
        <EmptyState title="No task has closed yet.">
          Payouts appear here once a task is approved, released, expired or cancelled. <Link href="/tasks" className="text-green underline underline-offset-2">See tasks</Link>.
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {closed.map((t) => (
            <SettlementCard key={t.id} task={t} agents={agents} coordinator={data.coordinator} lookup={lookup} />
          ))}
        </div>
      )}

      <p className="text-xs text-faint">
        Amounts follow the contract&apos;s payout rules. A settled task pays every slot and the coordinator fee. An expired task pays submitted slots and refunds the rest. A cancelled task refunds the escrow. Storage deposits are not part of the escrow.
        {lookup.state === "error" && <span className="block pt-1 text-bad">Transaction lookup failed: {lookup.message}</span>}
      </p>
    </div>
  );
}

function SettlementCard({ task, agents, coordinator, lookup }: { task: Task; agents: Map<string, Agent>; coordinator: string; lookup: Lookup }) {
  const payouts = taskPayouts(task, agents, coordinator);
  const total = payouts.reduce((s, p) => s + p.amount, 0n);
  const tx = lookup.state === "ready" ? lookup.txs.get(task.id) : undefined;

  return (
    <article className="min-w-0 rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-4">
        <Link href={`/tasks/${task.id}`} className="flex min-h-11 min-w-0 flex-col justify-center hover:text-green">
          <span className="font-medium">
            <span className="font-mono text-faint">#{task.id}</span> {task.title}
          </span>
        </Link>
        <StatusPill status={task.status} />
      </header>

      <div className="px-4 pt-3 text-xs">
        {lookup.state === "loading" && <span className="text-muted">Looking up the closing transaction…</span>}
        {tx && (
          <span className="flex flex-wrap items-center gap-x-2 text-fg-2">
            {HOW[tx.method!]} on {when(tx.ts)}.
            <a href={explorer.tx(tx.hash)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono text-muted underline decoration-line-strong underline-offset-4 hover:text-green">
              {tx.hash.slice(0, 10)}…
            </a>
          </span>
        )}
        {lookup.state !== "loading" && !tx && (
          <span className="flex flex-wrap items-center gap-x-2 text-muted">
            Closing transaction not found automatically.
            <a href={explorer.account(network.contractId ?? "")} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
              See the contract on the explorer
            </a>
          </span>
        )}
      </div>

      <ul className="divide-y divide-line px-4">
        {payouts.map((p) => (
          <li key={`${p.to}-${p.label}-${p.role}`} style={roleVars(p.role)} className="flex items-center justify-between gap-3 py-1.5">
            <a href={explorer.account(p.to)} target="_blank" rel="noreferrer" title={p.to} className="flex min-h-11 min-w-0 flex-col justify-center hover:text-green">
              <span className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
                {p.role && <RoleTag role={p.role} />}
                {p.label}
              </span>
              <span className="font-mono text-[11px] text-muted">{shortenAccount(p.to, 26)}</span>
            </a>
            <span className={`shrink-0 font-mono text-sm ${p.label === "Refund to creator" ? "text-fg-2" : "text-green"}`}>+{formatNear(p.amount)}</span>
          </li>
        ))}
      </ul>
      <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs">
        <span className="text-faint">Total out of escrow</span>
        <span className="font-mono text-fg">
          {formatNear(total)} / {formatNear(task.escrow)} NEAR {total === BigInt(task.escrow) && <span className="text-green">✓</span>}
        </span>
      </footer>
    </article>
  );
}
