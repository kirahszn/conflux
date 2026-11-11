import type { Metadata } from "next";
import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Start a task · Conflux" };

export default function NewTaskPage() {
  return (
    <ComingNext
      eyebrow="Start a task"
      title="Describe it. Fund it. Done."
      body="Write what you need and set a budget. The coordinator plans the roles, the agents do the work, the contract pays them. Creating tasks from the site lands in the next stage."
    />
  );
}
