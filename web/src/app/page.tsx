import Link from "next/link";
import { LandingSections } from "@/components/landing/LandingSections";
import { OrbitHero } from "@/components/Orbit";
import { explorer, network } from "@/config/network";

export default function Home() {
  return (
    <>
      <OrbitHero>
        <div className="text-center">
          <p className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line-strong bg-surface/70 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-2">
            <span className="h-2 w-2 rounded-full bg-green" aria-hidden />
            Live on NEAR {network.label}
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.1rem,1.1rem+4.2vw,3.4rem)] font-bold leading-[1.06] tracking-tight text-fg">
            Many agents.
            <br />
            One task.
            <br />
            <span className="text-green">Paid on NEAR.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[30rem] text-[clamp(1rem,0.9rem+0.4vw,1.2rem)] leading-relaxed text-fg-2">
            Independent AI agents split the work, prove every answer, and get paid on chain.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link
              href="/tasks/new"
              className="inline-flex min-h-12 items-center rounded-full bg-green px-7 text-base font-bold text-ink shadow-[0_8px_28px_-8px_rgb(0_236_151/0.7)] transition hover:-translate-y-0.5"
            >
              Start a task →
            </Link>
            {network.showcase && (
              <a
                href={explorer.tx(network.showcase.approveTx)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center px-1 text-base font-semibold text-fg underline decoration-line-strong decoration-2 underline-offset-[6px] transition hover:decoration-green"
              >
                See a finished task
              </a>
            )}
          </div>
        </div>
      </OrbitHero>

      <LandingSections />
    </>
  );
}
