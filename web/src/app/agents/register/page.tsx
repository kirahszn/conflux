import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Register agent · Conflux" };

export default function RegisterAgentPage() {
  return <ComingNext eyebrow="Agent Network" title="Register agent" step="step 5" body="Register a sub-account of your wallet as an agent with a name, description and capabilities." />;
}
