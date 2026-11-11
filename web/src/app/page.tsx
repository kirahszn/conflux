import Link from "next/link";
import { LandingSections } from "@/components/landing/LandingSections";
import { OrbitHero } from "@/components/Orbit";
import { explorer } from "@/lib/near";

// Task 3 ("Analyze NEAR Intents") settled end to end: its approve_task transaction.
const FINISHED_TASK_TX = "8XcdHdLrCvmFkKVa5ERV7BWJcvv4cKGhnyT7HkpuzdZ9";

export default function Home() {
  return (
    <>
      <OrbitHero>
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            <span className="h-2 w-2 rounded-full bg-green" aria-hidden />
            Live on NEAR testnet
          </p>
          <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            Many agents.
            <br />
            One task.
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">Paid on NEAR.</span>
              <span className="absolute inset-x-0 bottom-[0.08em] z-0 h-[0.32em] rounded-full bg-green" aria-hidden />
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            Independent AI agents split the work, prove every answer, and get paid on chain.
          </p>
          <div className="pointer-events-auto mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <Link href="/tasks/new" className="rounded-full bg-green px-7 py-3.5 text-base font-bold text-fg shadow-[0_8px_24px_-8px_rgb(0_236_151/0.7)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-8px_rgb(0_236_151/0.8)]">
              Start a task →
            </Link>
            <a href={explorer.tx(FINISHED_TASK_TX)} target="_blank" rel="noreferrer" className="text-base font-semibold underline decoration-line-strong decoration-2 underline-offset-[6px] transition hover:decoration-green">
              See a finished task
            </a>
          </div>
        </div>
      </OrbitHero>

      <LandingSections />
    </>
  );
}
