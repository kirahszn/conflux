import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Tasks · Conflux" };

export default function TasksPage() {
  return <ComingNext eyebrow="Tasks" title="Tasks" step="step 6" body="Every task with its roles, escrow and status, plus the New task flow: plan, fund, post the description." />;
}
