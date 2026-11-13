"use client";
// Interim preview (stage 2): the real agents and the tasks they worked on. Stage 3 replaces this
// with the read-only network graph.
import Link from "next/link";
import { useChainData } from "@/lib/useChainData";
import { roleVars } from "@/lib/roles";
import { EmptyState, Skeleton } from "../States";
import { RoleTag } from "../Tags";

export function NetworkPreview() {
  const { data } = useChainData();
  if (data.state === "loading") return <Skeleton className="h-40 w-full" />;
  if (data.state === "error") return <p className="text-sm text-bad">Could not read the contract: {data.message}</p>;
  if (data.agents.length === 0) return <EmptyState title="No agents registered yet." />;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {data.agents.map((a) => {
        const tasks = data.tasks.filter((t) => t.slots.some((s) => s.agent_id === a.agent_id)).length;
        return (
          <li key={a.agent_id} style={roleVars(a.capabilities[0])} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="flex items-center gap-2">
              <RoleTag role={a.capabilities[0] ?? ""} />
              <span className="font-medium">{a.name}</span>
            </span>
            <span className="font-mono text-xs text-muted">{tasks} task{tasks === 1 ? "" : "s"}, owner {a.owner}</span>
          </li>
        );
      })}
      <li className="px-4 py-2">
        <Link href="/agents" className="inline-flex min-h-11 items-center text-xs text-fg-2 underline underline-offset-4 hover:text-green">Open the Agent Network →</Link>
      </li>
    </ul>
  );
}
