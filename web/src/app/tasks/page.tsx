import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/PageHeader";
import { TasksTable } from "@/components/tasks/TasksTable";

export const metadata: Metadata = { title: "Tasks · Conflux" };

export default function TasksPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description="Every task on the contract. Open one to follow its agents live."
        actions={
          <Link href="/tasks/new" className="inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink hover:brightness-110">
            New task
          </Link>
        }
      />
      <div className="mt-6">
        <TasksTable />
      </div>
    </Page>
  );
}
