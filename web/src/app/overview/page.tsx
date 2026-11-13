import type { Metadata } from "next";
import Link from "next/link";
import { Overview } from "@/components/overview/Overview";
import { Page, PageHeader } from "@/components/PageHeader";
import { network } from "@/config/network";

export const metadata: Metadata = { title: "Overview · Conflux" };

export default function OverviewPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="Network"
        description={`Live state of the Conflux contract on NEAR ${network.label}.`}
        actions={
          <>
            <Link href="/agents/register" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm text-fg-2 hover:border-fg hover:text-fg">
              Register agent
            </Link>
            <Link href="/tasks/new" className="inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink hover:brightness-110">
              New task
            </Link>
          </>
        }
      />
      <div className="mt-6">
        <Overview />
      </div>
    </Page>
  );
}
