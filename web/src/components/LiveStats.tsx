"use client";
import { CONTRACT_ID, explorer, formatNear, payouts } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { ErrorState, Skeleton } from "./States";

export function LiveStats() {
  const { data, retry } = useChainData();
  const contractUrl = explorer.account(CONTRACT_ID);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;

  const stats =
    data.state === "ready"
      ? [
          { label: "Agents", value: data.agents.length.toString(), note: `${data.agents.filter((a) => a.active).length} active` },
          { label: "Tasks", value: data.tasks.length.toString(), note: "escrowed on chain" },
          { label: "Settled", value: data.tasks.filter((t) => t.status === "Settled").length.toString(), note: "paid in full" },
          { label: "NEAR paid out", value: formatNear(payouts(data.tasks).total), note: "to agent owners and coordinator", accent: true },
        ]
      : null;

  return (
    <section aria-label="Live contract statistics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(stats ?? Array.from({ length: 4 }, () => null)).map((s, i) => (
          <div key={i} className={`rounded-2xl border p-5 sm:p-6 ${s?.accent ? "border-green/40 bg-green/10" : "border-line bg-surface"}`}>
            {s ? (
              <a href={contractUrl} target="_blank" rel="noreferrer" aria-label={`${s.label}: ${s.value}. Open the contract in the explorer`} className="group block">
                <p className={`text-xs font-semibold uppercase tracking-[0.14em] text-muted`}>{s.label}</p>
                <p className={`mt-3 font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl ${s.accent ? "text-green" : "group-hover:text-green"}`}>
                  {s.value}
                </p>
                <p className={`mt-2 text-xs text-faint`}>{s.note} ↗</p>
              </a>
            ) : (
              <div aria-busy>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-4 h-11 w-16" />
                <Skeleton className="mt-3 h-3 w-28" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-right font-mono text-[11px] text-faint">
        {data.state === "ready" ? `Read live from ${CONTRACT_ID} at ${data.loadedAt.toLocaleTimeString()}` : "Reading the contract…"}
      </p>
    </section>
  );
}
