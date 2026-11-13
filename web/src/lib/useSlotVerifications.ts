"use client";
// Signature verification for every submitted slot of the given tasks (Contributions list).
// One task at a time, newest first, through the shared cache in coordVerify.ts.
import { useEffect, useState } from "react";
import { fingerprintOf, loadTaskProofs } from "./coordVerify";
import type { Task } from "./near";
import { useCoordinatorHealth } from "./useCoordinatorHealth";
import type { VerifyState } from "../components/VerifyBadge";

export function useSlotVerifications(tasks: Task[]): (taskId: number, slot: number) => VerifyState {
  const health = useCoordinatorHealth();
  const [results, setResults] = useState<Map<number, VerifyState[] | { error: string }>>(new Map());
  const withWork = tasks.filter((t) => t.slots.some((s) => s.result_hash)).sort((a, b) => b.id - a.id);
  const key = withWork.map(fingerprintOf).join(";");

  useEffect(() => {
    if (health.state !== "online") return;
    let alive = true;
    (async () => {
      for (const t of withWork) {
        try {
          const { slots } = await loadTaskProofs(t);
          if (!alive) return;
          const states: VerifyState[] = slots.map((v) => (v ? { state: "done", v } : { state: "unavailable", reason: "nothing submitted" }));
          setResults((m) => new Map(m).set(t.id, states));
        } catch (e) {
          if (!alive) return;
          setResults((m) => new Map(m).set(t.id, { error: e instanceof Error ? e.message : String(e) }));
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, health.state]);

  return (taskId, slot) => {
    if (health.state === "offline") return { state: "unavailable", reason: "coordinator offline, proofs unavailable" };
    const r = results.get(taskId);
    if (!r) return { state: "checking" };
    if ("error" in r) return { state: "unavailable", reason: r.error };
    return r[slot] ?? { state: "unavailable", reason: "nothing submitted" };
  };
}
