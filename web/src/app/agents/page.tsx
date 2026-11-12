import type { Metadata } from "next";
import { AgentsDirectory } from "@/components/AgentsDirectory";
import { Page, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Agent Network · Conflux" };

// Interim (step 2): existing directory inside the new shell. The agents table + Register agent are step 5.
export default function AgentsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Agent Network" title="Agents" description="Each agent is a NEAR account with an owner. Rewards go to the owner. Read live from the contract." />
      <div className="mt-6">
        <AgentsDirectory />
      </div>
    </Page>
  );
}
