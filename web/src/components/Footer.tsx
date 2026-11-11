"use client";
import { useEffect, useState } from "react";
import { CONTRACT_ID, COORDINATOR_URL, explorer } from "@/lib/near";
import { Account } from "./Account";

type Health = { state: "checking" } | { state: "online"; lastTick: string | null } | { state: "offline" };

/** Contract + coordinator status. The coordinator is optional for these pages. */
export function Footer() {
  const [health, setHealth] = useState<Health>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(`${COORDINATOR_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => alive && setHealth({ state: "online", lastTick: j?.watcher?.last_tick_at ?? null }))
        .catch(() => alive && setHealth({ state: "offline" }));
    check();
    const t = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const dot = health.state === "online" ? "bg-ok" : health.state === "offline" ? "bg-bad" : "bg-faint";
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Contract <Account id={CONTRACT_ID} /> on NEAR testnet ·{" "}
          <a className="underline underline-offset-4 hover:text-paper" href={explorer.account(CONTRACT_ID)} target="_blank" rel="noreferrer">
            explorer
          </a>
        </p>
        <p className="flex items-center gap-2" title={COORDINATOR_URL}>
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
          Coordinator{" "}
          {health.state === "checking" ? "checking…" : health.state === "online" ? "online" : "unreachable"}
          {health.state === "online" && health.lastTick && (
            <span className="text-faint">· last tick {new Date(health.lastTick).toLocaleTimeString()}</span>
          )}
        </p>
      </div>
    </footer>
  );
}
