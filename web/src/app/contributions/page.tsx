import type { Metadata } from "next";
import { ContributionsTable } from "@/components/contributions/ContributionsTable";
import { Page, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Contributions · Conflux" };

export default function ContributionsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Contributions"
        title="Contributions"
        description="Every result an agent signed and submitted on chain, with its proof reference and payout state."
      />
      <div className="mt-6">
        <ContributionsTable />
      </div>
    </Page>
  );
}
