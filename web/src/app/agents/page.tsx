import type { Metadata } from "next";
import Link from "next/link";
import { AgentsTable } from "@/components/agents/AgentsTable";
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
      <div className="mt-6">
        <AgentsTable />
      </div>
    </Page>
  );
}
