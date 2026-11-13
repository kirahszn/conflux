"use client";
// Coordinator view of one task for Live Execution. Fetched again only when the on-chain state
// changes (fingerprint) or every 30s as a backstop, because a finished task's response carries
// the raw signed proofs (hundreds of KB). Every text is re-hashed in the browser and compared
// with the hash on chain, so the page never shows a report the contract does not vouch for.
import { useEffect, useState } from "react";
import type { CoordProofPart, CoordTask } from "./live";
import { COORDINATOR_URL, sha256Hex, type Task } from "./near";
import { useCoordinatorHealth } from "./useCoordinatorHealth";

export interface PlanInfo {
  slots: { role: string; reason: string; reward_near: string }[];
  proof: CoordProofPart;
}
export interface CoordView {
  task: CoordTask;
  /** per slot: sha256(stored report) === on-chain result_hash (null if no report stored) */
  slotVerified: (boolean | null)[];
  plan: PlanInfo | null;
  report: string | null;
  reportVerified: boolean | null;
  loadedAt: Date;
}
export type CoordState = { state: "offline"; reason: string } | { state: "loading" } | { state: "ready"; view: CoordView } | { state: "error"; message: string };

const get = (path: string) => fetch(`${COORDINATOR_URL}${path}`, { signal: AbortSignal.timeout(15_000) });

export function useCoordTask(task: Task | null): CoordState {
  const health = useCoordinatorHealth();
  const [st, setSt] = useState<CoordState>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const fingerprint = task ? `${task.id}|${task.status}|${task.slots.map((s) => s.result_hash ?? "-").join(",")}|${task.final_report_hash ?? "-"}` : "";

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!task) return;
    if (health.state === "offline") return setSt({ state: "offline", reason: health.reason });
    if (health.state !== "online" || !COORDINATOR_URL) return;
    let alive = true;
    (async () => {
      try {
        const r = await get(`/tasks/${task.id}`);
        if (!r.ok) throw new Error(`GET /tasks/${task.id}: HTTP ${r.status}`);
        const raw = (await r.json()) as CoordTask & { slots: (CoordTask["slots"][number] & { proof: unknown })[] };
        // Keep only what the page shows; drop raw request/response bodies from memory.
        const slim: CoordTask = {
          description: raw.description,
          final_report: raw.final_report,
          slots: raw.slots.map((s) => ({
            result: s.result,
            proof:
              s.proof && typeof s.proof === "object" && "write" in (s.proof as object)
                ? {
                    gather: pick((s.proof as { gather?: CoordProofPart | null }).gather ?? null),
                    write: pick((s.proof as { write: CoordProofPart }).write),
                  }
                : (s.proof as CoordTask["slots"][number]["proof"]),
          })),
        };
        const slotVerified = await Promise.all(
          slim.slots.map(async (s, i) => (s.result ? (await sha256Hex(s.result)) === task.slots[i]?.result_hash : null)),
        );
        let plan: PlanInfo | null = null;
        const pr = await get(`/tasks/${task.id}/plan`);
        if (pr.ok) plan = (await pr.json()) as PlanInfo;
        let report: string | null = null;
        let reportVerified: boolean | null = null;
        if (task.final_report_hash) {
          const rr = await get(`/tasks/${task.id}/report`);
          if (rr.ok) {
            report = await rr.text();
            reportVerified = (await sha256Hex(report)) === task.final_report_hash;
          }
        }
        if (alive) setSt({ state: "ready", view: { task: slim, slotVerified, plan, report, reportVerified, loadedAt: new Date() } });
      } catch (e) {
        if (alive) setSt((prev) => (prev.state === "ready" ? prev : { state: "error", message: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, health.state, tick]);

  return st;
}

function pick(p: CoordProofPart | null | undefined): CoordProofPart | undefined {
  return p ? { kind: p.kind, model: p.model, chat_id: p.chat_id, signing_address: p.signing_address } : undefined;
}
