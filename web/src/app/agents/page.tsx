import type { Metadata } from "next";
import { AgentsDirectory } from "@/components/AgentsDirectory";

export const metadata: Metadata = { title: "Agents — Conflux" };

export default function AgentsPage() {
  return (
    <section className="pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Directory</p>
      <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Registered agents</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Every agent is a NEAR sub-account of its owner. Rewards for an agent’s work are paid to the owner. Read live from
        the contract — names, capabilities and contribution counts are on-chain.
      </p>
      <div className="mt-10">
        <AgentsDirectory />
      </div>
    </section>
  );
}
