"use client";
// Coordinator reachability, shared by every component (one poll for the whole app).
import { useEffect, useState } from "react";
import { COORDINATOR_URL } from "./near";

export type CoordinatorHealth =
  | { state: "checking" }
  | { state: "online"; lastTickAt: string | null; lastTickOk: boolean | null }
  | { state: "offline"; reason: string };

let current: CoordinatorHealth = COORDINATOR_URL ? { state: "checking" } : { state: "offline", reason: "No coordinator is configured for this network." };
const listeners = new Set<(h: CoordinatorHealth) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function check() {
  if (!COORDINATOR_URL) return;
  let next: CoordinatorHealth;
  try {
    const r = await fetch(`${COORDINATOR_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { watcher?: { last_tick_at?: string | null; last_tick_ok?: boolean | null } };
    next = { state: "online", lastTickAt: j.watcher?.last_tick_at ?? null, lastTickOk: j.watcher?.last_tick_ok ?? null };
  } catch (e) {
    next = { state: "offline", reason: `Could not reach ${COORDINATOR_URL} (${e instanceof Error ? e.message : "network error"}).` };
  }
  current = next;
  for (const l of listeners) l(next);
}

export function useCoordinatorHealth(): CoordinatorHealth {
  const [h, setH] = useState<CoordinatorHealth>(current);
  useEffect(() => {
    listeners.add(setH);
    setH(current);
    if (!timer && COORDINATOR_URL) {
      void check();
      timer = setInterval(check, 30_000);
    }
    return () => {
      listeners.delete(setH);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return h;
}
