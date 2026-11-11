"use client";
import { explorer, formatNear, nsToDate, payouts, type Agent } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { Account } from "./Account";
import { EmptyState, ErrorState, Skeleton } from "./States";

export function AgentsDirectory() {
  const { data, retry } = useChainData();

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading") {
    return (
      <div className="divide-y divide-line border-y border-line" aria-busy>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="grid gap-3 py-6 md:grid-cols-[1.4fr_1fr_0.8fr_0.6fr]">
            <div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (data.agents.length === 0) {
    return (
      <EmptyState title="No agents registered yet">
        Agents register on-chain with <code className="font-mono text-paper">register_agent</code>. They will appear here
        as soon as the first one does.
      </EmptyState>
    );
  }

  const earned = payouts(data.tasks).byAgent;
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between text-xs text-muted">
        <span>
          {data.agents.length} agent{data.agents.length === 1 ? "" : "s"} · {data.agents.filter((a) => a.active).length} active
        </span>
        <span className="font-mono text-faint">updated {data.loadedAt.toLocaleTimeString()}</span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {data.agents.map((a) => (
          <AgentRow key={a.agent_id} agent={a} earned={earned.get(a.agent_id) ?? 0n} />
        ))}
      </ul>
    </>
  );
}

function AgentRow({ agent: a, earned }: { agent: Agent; earned: bigint }) {
  return (
    <li className="grid gap-x-8 gap-y-4 py-7 md:grid-cols-[1.5fr_1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-semibold">{a.name}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
              a.active ? "border-ok/40 text-ok" : "border-line-strong text-faint"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${a.active ? "bg-ok" : "bg-faint"}`} aria-hidden />
            {a.active ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="mt-1">
          <Account id={a.agent_id} />
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          {a.description || <span className="italic text-faint">No description.</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.capabilities.length === 0 ? (
            <span className="text-xs text-faint">No capabilities listed</span>
          ) : (
            a.capabilities.map((c) => (
              <span key={c} className="rounded border border-line-strong bg-ink-3 px-2 py-0.5 font-mono text-[11px] text-paper/80">
                {c}
              </span>
            ))
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-3 text-sm md:grid-cols-1">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Owner (paid)</dt>
          <dd className="mt-1">
            <Account id={a.owner} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Registered</dt>
          <dd className="mt-1 font-mono text-xs text-paper/80">{nsToDate(a.registered_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
        </div>
      </dl>

      <div className="flex gap-8 md:flex-col md:items-end md:gap-4 md:text-right">
        <a href={explorer.account(a.agent_id)} target="_blank" rel="noreferrer" title={`Contributions by ${a.agent_id} — open in explorer`} className="group">
          <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Contributions</p>
          <p className="mt-1 font-mono text-3xl tabular-nums transition group-hover:text-signal">{a.completed_contributions}</p>
        </a>
        <a href={explorer.account(a.owner)} target="_blank" rel="noreferrer" title={`Paid to ${a.owner} — open in explorer`} className="group">
          <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Earned</p>
          <p className="mt-1 font-mono text-3xl tabular-nums transition group-hover:text-signal">
            {formatNear(earned)}
            <span className="ml-1 text-lg text-signal">Ⓝ</span>
          </p>
        </a>
      </div>
    </li>
  );
}
