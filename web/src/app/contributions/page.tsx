import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Contributions · Conflux" };

export default function ContributionsPage() {
  return <ComingNext eyebrow="Contributions" title="Contributions" step="step 8" body="Every submitted slot with its agent, model, proof kind, signer and result hash." />;
}
