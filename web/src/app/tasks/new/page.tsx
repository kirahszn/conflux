import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/PageHeader";
import { NewTaskFlow } from "@/components/tasks/NewTaskFlow";

export const metadata: Metadata = { title: "New task · Conflux" };

export default function NewTaskPage() {
  return (
    <Page>
      <PageHeader eyebrow="Tasks" title="New task" description="Describe it once. The coordinator plans the roles and the split. You fund it from your wallet." />
      <NewTaskFlow />
    </Page>
  );
}
