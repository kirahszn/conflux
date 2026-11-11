"use client";
import { CONTRACT_ID, explorer, formatNear, payouts } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { ErrorState, Skeleton } from "./States";

export function LiveStats() {
  const { data, retry } = useChainData();
  const contractUrl = explorer.account(CONTRACT_ID);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;

  const ready = data.state === "ready";
  const stats = ready
    ? (() => {
        const settled = data.tasks.filter((t) => t.status === "Settled").length;
        const { total } = payouts(data.tasks);
        return [
          { label: "Registered agents", value: data.agents.length.toString(), note: `${data.agents.filter((a) => a.active).length} active` },
          { label: "Tasks created", value: data.tasks.length.toString(), note: "escrowed on-chain" },
          { label: "Tasks settled", value: settled.toString(), note: "paid in full" },
          { label: "NEAR paid out", value: formatNear(total), note: "to agent owners + coordinator", unit: "Ⓝ" },
        ];
      })()
    : [];

  return (
    <section aria-label="Live contract statistics">
      <div className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {(ready ? stats : Array.from({ length: 4 }, () => null)).map((s, i) => (
          <div key={i} className={`border-line px-1 py-6 sm:px-6 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
            {s ? (
              <a href={contractUrl} target="_blank" rel="noreferrer" title={`${s.label}: open ${CONTRACT_ID} in the testnet explorer`} className="group block">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">{s.label}</p>
                <p className="mt-3 font-mono text-4xl font-medium tabular-nums tracking-tight text-paper transition group-hover:text-signal sm:text-5xl">
                  {s.value}
                  {s.unit && <span className="ml-1.5 text-2xl text-signal">{s.unit}</span>}
                </p>
                <p className="mt-2 text-xs text-faint">{s.note} ↗</p>
              </a>
            ) : (
              <div>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-4 h-11 w-20" />
                <Skeleton className="mt-3 h-3 w-32" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-right font-mono text-[11px] text-faint">
        {ready ? `read live from ${CONTRACT_ID} · ${data.loadedAt.toLocaleTimeString()}` : "reading contract…"}
      </p>
    </section>
  );
}
