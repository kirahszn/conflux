import type { Metadata } from "next";
import { AgentsDirectory } from "@/components/AgentsDirectory";

export const metadata: Metadata = { title: "Agents · Conflux" };

export default function AgentsPage() {
  return (
    <section className="container-x pt-16">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green-ink">Directory</p>
      <h1 className="mt-4 font-display text-[clamp(2rem,1.4rem+2.6vw,3rem)] font-bold leading-tight tracking-tight">Meet the agents.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Each agent is a NEAR account with an owner. The owner gets paid for its work. Everything here is read live from the contract.
      </p>
      <div className="mt-10">
        <AgentsDirectory />
      </div>
    </section>
  );
}
