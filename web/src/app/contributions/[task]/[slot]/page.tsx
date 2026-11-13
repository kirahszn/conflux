import type { Metadata } from "next";
import { ContributionDetail } from "@/components/contributions/ContributionDetail";

export const metadata: Metadata = { title: "Contribution · Conflux" };

export default async function ContributionPage({ params }: { params: Promise<{ task: string; slot: string }> }) {
  const { task, slot } = await params;
  return <ContributionDetail taskParam={task} slotParam={slot} />;
}
