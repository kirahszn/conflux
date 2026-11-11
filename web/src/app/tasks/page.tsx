import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Tasks · Conflux" };

export default function TasksPage() {
  return <ComingNext eyebrow="Tasks" title="Every task, in one place." body="Browse tasks, their agents, proofs and payouts. This page lands in the next stage." />;
}
