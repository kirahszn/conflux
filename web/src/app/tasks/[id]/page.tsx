import type { Metadata } from "next";
import { TaskView } from "@/components/tasks/TaskView";

export const metadata: Metadata = { title: "Task · Conflux" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskView idParam={id} />;
}
