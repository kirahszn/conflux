import type { Metadata } from "next";
import { LiveExecution } from "@/components/tasks/LiveExecution";

export const metadata: Metadata = { title: "Live Execution · Conflux" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveExecution idParam={id} />;
}
