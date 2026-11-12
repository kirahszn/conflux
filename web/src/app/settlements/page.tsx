import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Settlements · Conflux" };

export default function SettlementsPage() {
  return <ComingNext eyebrow="Settlements" title="Settlements" step="step 9" body="Payouts per task, computed from the contract's payout rules, with explorer links." />;
}
