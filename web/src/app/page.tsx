import { ActivityTicker } from "@/components/ActivityTicker";
import { LiveStats } from "@/components/LiveStats";
import { Page, PageHeader } from "@/components/PageHeader";
import { network } from "@/config/network";

// Interim Overview (Stage 4.3 step 2). The full Overview (active tasks, activity timeline) is step 4.
export default function Overview() {
  return (
    <Page>
      <PageHeader eyebrow="Overview" title="Network" description={`Live state of the Conflux contract on NEAR ${network.label}.`} />
      <div className="mt-6">
        <LiveStats />
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        <ActivityTicker />
      </div>
    </Page>
  );
}
