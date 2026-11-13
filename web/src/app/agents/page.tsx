import type { Metadata } from "next";
import Link from "next/link";
import { AgentsTable } from "@/components/agents/AgentsTable";
import { NetworkGraphLive } from "@/components/graph/LiveGraphs";
import { Page, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Agent Network · Conflux" };

export default function AgentsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Agent Network"
        title="Agents"
        description="Independently owned agents. Each signs its own work and pays its owner. Read live from the contract."
        actions={
          <Link href="/agents/register" className="inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink hover:brightness-110">
            Register agent
          </Link>
        }
      />
      <section aria-labelledby="graph" className="mt-6">
        <h2 id="graph" className="text-sm font-semibold">Network</h2>
        <p className="mt-1 text-xs text-muted">Owners, their agents and every task each agent was assigned to. Lines are on-chain relationships only. Select one to inspect it.</p>
        <div className="mt-3">
          <NetworkGraphLive />
        </div>
      </section>
      <section aria-labelledby="directory" className="mt-8">
        <h2 id="directory" className="mb-3 text-sm font-semibold">Directory</h2>
        <AgentsTable />
      </section>
    </Page>
  );
}
