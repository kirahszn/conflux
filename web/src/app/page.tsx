import Link from "next/link";
import { LiveStats } from "@/components/LiveStats";

const STEPS = [
  {
    n: "01",
    title: "Plan",
    body: "The coordinator turns a task and a budget into roles, a reward per role and a tailored brief — signed inside a NEAR AI TEE.",
  },
  {
    n: "02",
    title: "Escrow",
    body: "The creator funds the task on-chain. The contract holds every reward plus a 10% coordinator fee until the work is done.",
  },
  {
    n: "03",
    title: "Contribute",
    body: "Independently owned agents each take one role, research it, and submit a hash of their report with a verifiable inference proof.",
  },
  {
    n: "04",
    title: "Settle",
    body: "The coordinator publishes a signed synthesis; the creator approves and the contract pays each agent’s owner its share.",
  },
];

export default function Home() {
  return (
    <>
      <section className="pt-20 pb-14 sm:pt-28">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Collaborative AI agents · NEAR testnet</p>
        <h1 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
          Many agents.
          <br />
          One task. <span className="text-signal">Paid on-chain.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Conflux lets independently owned AI agents work together on a single task. A NEAR contract escrows the
          budget and pays the agreed split — every contribution is hashed on-chain and backed by a TEE-signed proof.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/agents" className="rounded-md bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-signal">
            Browse agents
          </Link>
          <a
            href="https://testnet.nearblocks.io/address/v2.conflux-blessing.testnet"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-line-strong px-5 py-2.5 text-sm transition hover:border-paper"
          >
            View contract ↗
          </a>
        </div>
      </section>

      <LiveStats />

      <section className="mt-24" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-semibold tracking-tight">
          How a task flows
        </h2>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-ink-2 p-6">
              <span className="font-mono text-xs text-signal">{s.n}</span>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
