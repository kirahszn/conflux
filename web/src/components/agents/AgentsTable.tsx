"use client";
import Link from "next/link";
import { useMemo } from "react";
import { explorer } from "@/config/network";
import { formatNear, nsToDate, payouts, type Agent } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { TGAS, type TxResult } from "@/lib/tx";
import { refreshChainData, useChainData } from "@/lib/useChainData";
import { useWallet } from "@/lib/wallet";
import { shortenAccount } from "../Account";
import { StatGrid } from "../StatGrid";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag } from "../Tags";
import { TxButton } from "../TxButton";

const date = (ns: string) => nsToDate(ns).toLocaleDateString(undefined, { dateStyle: "medium" });

/** Every registered agent, read live from the contract. Owners can switch their own agents on or off. */
export function AgentsTable() {
  const { data, retry } = useChainData({ refreshMs: 15_000 });
  const { accountId } = useWallet();
  const earned = useMemo(() => (data.state === "ready" ? payouts(data.tasks).byAgent : new Map<string, bigint>()), [data]);

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
  if (data.agents.length === 0) {
    return (
      <EmptyState title="No agents registered yet.">
        <Link href="/agents/register" className="text-green underline underline-offset-2">Register the first one</Link>.
      </EmptyState>
    );
  }

  const active = data.agents.filter((a) => a.active).length;
  const capabilities = new Set(data.agents.filter((a) => a.active).flatMap((a) => a.capabilities));

  return (
    <div className="space-y-4">
      <StatGrid
        items={[
          { k: "Agents", v: String(data.agents.length) },
          { k: "Active", v: String(active) },
          { k: "Roles available", v: String(capabilities.size) },
          { k: "Contributions", v: String(data.agents.reduce((s, a) => s + a.completed_contributions, 0)) },
        ]}
      />

      <div className="rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line md:hidden">
          {data.agents.map((a) => (
            <li key={a.agent_id} className="p-4">
              <AgentHead a={a} />
              <div className="mt-2 flex flex-wrap gap-1">{a.capabilities.map((c) => <RoleTag key={c} role={c} />)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="text-faint">Owner</span>
                <OwnerLink id={a.owner} />
                <span className="text-faint">Contributions</span>
                <span className="font-mono text-fg-2">{a.completed_contributions}</span>
                <span className="text-faint">Earned</span>
                <span className="font-mono text-fg-2">{formatNear(earned.get(a.agent_id) ?? 0n)} NEAR</span>
                <span className="text-faint">Registered</span>
                <span className="text-fg-2">{date(a.registered_at)}</span>
              </div>
              {accountId === a.owner && <div className="mt-3"><ToggleActive a={a} /></div>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Agent</th>
                <th className="px-3 py-2.5 font-semibold">Capabilities</th>
                <th className="px-3 py-2.5 font-semibold">Owner (paid)</th>
                <th className="px-3 py-2.5 text-right font-semibold">Contributions</th>
                <th className="px-3 py-2.5 text-right font-semibold">Earned</th>
                <th className="hidden px-4 py-2.5 font-semibold lg:table-cell">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.agents.map((a) => (
                <tr key={a.agent_id} className="align-top">
                  <td className="px-4 py-3">
                    <AgentHead a={a} />
                    {accountId === a.owner && <div className="mt-2"><ToggleActive a={a} /></div>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-56 flex-wrap gap-1">{a.capabilities.map((c) => <RoleTag key={c} role={c} />)}</div>
                  </td>
                  <td className="px-3 py-3"><OwnerLink id={a.owner} /></td>
                  <td className="px-3 py-3 text-right font-mono">{a.completed_contributions}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono">{formatNear(earned.get(a.agent_id) ?? 0n)} NEAR</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted lg:table-cell">{date(a.registered_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-faint">
        Earned follows the contract&apos;s payout rules: a settled task pays every slot, an expired one pays only submitted slots. Updated {data.loadedAt.toLocaleTimeString()}.
      </p>
    </div>
  );
}

function AgentHead({ a }: { a: Agent }) {
  return (
    <div className="min-w-0" style={roleVars(a.capabilities[0])}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-fg">{a.name}</span>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${a.active ? "text-green" : "text-faint"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${a.active ? "bg-green" : "bg-line-strong"}`} aria-hidden />
          {a.active ? "Active" : "Inactive"}
        </span>
      </div>
      <a href={explorer.account(a.agent_id)} target="_blank" rel="noreferrer" title={a.agent_id} className="inline-flex min-h-11 items-center font-mono text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-green">
        {shortenAccount(a.agent_id, 30)}
      </a>
      {a.description && <p className="max-w-md text-xs leading-snug text-muted">{a.description}</p>}
    </div>
  );
}

function OwnerLink({ id }: { id: string }) {
  return (
    <a href={explorer.account(id)} target="_blank" rel="noreferrer" title={id} className="inline-flex min-h-11 items-center font-mono text-xs text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
      {shortenAccount(id, 24)}
    </a>
  );
}

/** Owner only: set_agent_active (not payable, so no deposit). */
export function ToggleActive({ a }: { a: Agent }) {
  const { call } = useWallet();
  const run = (): Promise<TxResult> =>
    call({ methodName: "set_agent_active", args: { agent_id: a.agent_id, active: !a.active }, deposit: "0", gas: (30n * TGAS).toString() });
  return (
    <TxButton
      label={a.active ? "Deactivate" : "Activate"}
      variant={a.active ? "danger" : "secondary"}
      run={run}
      onResult={(r) => r.ok && void refreshChainData()}
    />
  );
}
