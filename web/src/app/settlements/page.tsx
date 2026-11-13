import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/PageHeader";
import { SettlementsView } from "@/components/settlements/SettlementsView";

export const metadata: Metadata = { title: "Settlements · Conflux" };

export default function SettlementsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Settlements"
        title="Settlements"
        description="Where every escrow went. Payouts follow the contract's rules, with the transaction that closed each task."
      />
      <div className="mt-6">
        <SettlementsView />
      </div>
    </Page>
  );
}
