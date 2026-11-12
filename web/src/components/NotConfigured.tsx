import { network } from "@/config/network";

/** Shown instead of every page when the configured network has no Conflux contract yet. */
export function NotConfigured() {
  return (
    <section className="container-x max-w-2xl pt-24 text-center">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-green">{network.label}</p>
      <h1 className="mt-4 font-display text-[clamp(1.75rem,1.2rem+1.8vw,2.5rem)] font-bold leading-tight">Not configured yet.</h1>
      <p className="mt-4 text-fg-2">
        No Conflux contract is set for NEAR {network.label}. Set <code className="font-mono text-fg">contractId</code> in{" "}
        <code className="font-mono text-fg">web/src/config/network.ts</code> or the{" "}
        <code className="font-mono text-fg">NEXT_PUBLIC_CONTRACT_ID</code> variable, then rebuild.
      </p>
    </section>
  );
}
