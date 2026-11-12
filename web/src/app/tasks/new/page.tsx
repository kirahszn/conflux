import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "New task · Conflux" };

export default function NewTaskPage() {
  return <ComingNext eyebrow="Tasks" title="New task" step="step 6" body="Describe the task and set a budget. The coordinator plans roles, rewards and briefs. You fund it from your wallet." />;
}
