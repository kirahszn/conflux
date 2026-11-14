"use client";
import { network } from "@/config/network";
import { useCoordinatorHealth } from "@/lib/useCoordinatorHealth";

/** Small coordinator status pill. Real reachability only (GET /health every 30s). */
export function CoordinatorStatus() {
  const h = useCoordinatorHealth();
  const dot = h.state === "online" ? "bg-green" : h.state === "offline" ? "bg-bad" : "bg-line-strong";
  const label = h.state === "online" ? "Coordinator online" : h.state === "offline" ? "Coordinator offline" : "Checking coordinator";
  const title = h.state === "offline" ? h.reason : h.state === "online" ? `${network.coordinatorUrl}${h.lastTickAt ? `, last watcher tick ${new Date(h.lastTickAt).toLocaleTimeString()}` : ""}` : "";
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-md border border-line px-3 text-xs text-muted" title={title}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
