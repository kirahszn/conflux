"use client";
import { explorer, formatNear, nsToDate, payouts, type Agent } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { useChainData } from "@/lib/useChainData";
import { Account } from "./Account";
import { EmptyState, ErrorState, Skeleton } from "./States";
import { RoleTag } from "./Tags";

export function AgentsDirectory() {
  const { data, retry } = useChainData();

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-3xl border border-line bg-surface p-6">
            <Skeleton className="h-5 w-24 !rounded-full" />
            <Skeleton className="mt-5 h-6 w-44" />
            <Skeleton className="mt-3 h-3 w-56" />
            <Skeleton className="mt-2 h-3 w-48" />
            <Skeleton className="mt-8 h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (data.agents.length === 0) {
    return (
      <EmptyState title="No agents yet.">
        Agents register on chain with <code className="font-mono text-fg">register_agent</code>. The first one will show up here.
      </EmptyState>
    );
  }

  const earned = payouts(data.tasks).byAgent;
  return (
    <>
      <div className="mb-4 flex items-baseline justify-between text-xs text-muted">
        <span>
          {data.agents.length} agent{data.agents.length === 1 ? "" : "s"}. {data.agents.filter((a) => a.active).length} active.
        </span>
        <span className="font-mono text-faint">Updated {data.loadedAt.toLocaleTimeString()}</span>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.agents.map((a) => (
          <AgentCard key={a.agent_id} agent={a} earned={earned.get(a.agent_id) ?? 0n} />
        ))}
      </ul>
    </>
  );
}

function AgentCard({ agent: a, earned }: { agent: Agent; earned: bigint }) {
  const role = a.capabilities[0] ?? "";
  return (
    <li style={roleVars(role)} className="role-card flex flex-col overflow-hidden rounded-3xl">
      <div className="role-bar h-1.5" aria-hidden />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-2">
          {a.capabilities.length === 0 ? (
            <span className="text-xs text-faint">No capabilities listed</span>
          ) : (
            a.capabilities.map((c) => <RoleTag key={c} role={c} />)
          )}
          <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold ${a.active ? "text-green-ink" : "text-faint"}`}>
            <span className={`h-2 w-2 rounded-full ${a.active ? "bg-green" : "bg-line-strong"}`} aria-hidden />
            {a.active ? "Active" : "Inactive"}
          </span>
        </div>
        <h2 className="mt-5 font-display text-xl font-bold tracking-tight">{a.name}</h2>
        <div className="mt-1">
          <Account id={a.agent_id} max={30} />
        </div>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{a.description || <span className="italic text-faint">No description.</span>}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Owner, gets paid</dt>
            <dd className="mt-1">
              <Account id={a.owner} max={18} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Registered</dt>
            <dd className="mt-1 font-mono text-xs text-fg-2">{nsToDate(a.registered_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
          </div>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5">
          <a href={explorer.account(a.agent_id)} target="_blank" rel="noreferrer" aria-label={`${a.completed_contributions} contributions by ${a.agent_id}. Open in explorer`} className="group">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Contributions</p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums transition group-hover:text-green-ink">{a.completed_contributions}</p>
          </a>
          <a href={explorer.account(a.owner)} target="_blank" rel="noreferrer" aria-label={`${formatNear(earned)} NEAR paid to ${a.owner}. Open in explorer`} className="group">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Earned</p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums transition group-hover:text-green-ink">
              {formatNear(earned)}
              <span className="ml-1 text-sm font-medium text-muted">NEAR</span>
            </p>
          </a>
        </div>
      </div>
    </li>
  );
}
