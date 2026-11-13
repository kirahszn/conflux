"use client";
// Coordinator view of one task for Live Execution and the contribution page. Fetched again only
// when the on-chain state changes (fingerprint) or every 30s as a backstop, because a finished
// task's response carries the raw signed proofs (hundreds of KB). Every signature and hash is
// checked in the browser (lib/verify.ts) against the chain before anything is called verified.
import { useEffect, useState } from "react";
import { coordGet, fingerprintOf, loadTaskProofs } from "./coordVerify";
import type { CoordProofPart, CoordTask } from "./live";
import { COORDINATOR_URL, type Task } from "./near";
import { useCoordinatorHealth } from "./useCoordinatorHealth";
import { sha256Hex, verifySynthesis, type ProofPart, type Verification } from "./verify";

export interface PlanInfo {
  slots: { role: string; reason: string; reward_near: string }[];
  proof: CoordProofPart;
}
export interface CoordView {
  task: CoordTask;
  /** per slot: sha256(stored report) === on-chain result_hash (null if no report stored) */
  slotVerified: (boolean | null)[];
  /** per slot: full signature verification (null when nothing was submitted) */
  slotVerification: (Verification | null)[];
  plan: PlanInfo | null;
  report: string | null;
  reportVerified: boolean | null;
  /** synthesis signature + its link to the on-chain final_report_hash (null before a final report) */
  synthVerification: Verification | null;
  loadedAt: Date;
}
export type CoordState = { state: "offline"; reason: string } | { state: "loading" } | { state: "ready"; view: CoordView } | { state: "error"; message: string };

export function useCoordTask(task: Task | null): CoordState {
  const health = useCoordinatorHealth();
  const [st, setSt] = useState<CoordState>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const fingerprint = task ? fingerprintOf(task) : "";

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
        const { slim, slots } = await loadTaskProofs(task);
        const slotVerified = slim.slots.map((s, i) => (s.result ? sha256Hex(s.result) === task.slots[i]?.result_hash : null));
        let plan: PlanInfo | null = null;
        const pr = await coordGet(`/tasks/${task.id}/plan`);
        if (pr.ok) plan = (await pr.json()) as PlanInfo;
        let report: string | null = null;
        let reportVerified: boolean | null = null;
        let synthVerification: Verification | null = null;
        if (task.final_report_hash) {
          const rr = await coordGet(`/tasks/${task.id}/report`);
          if (rr.ok) {
            report = await rr.text();
            reportVerified = sha256Hex(report) === task.final_report_hash;
          }
          const sr = await coordGet(`/tasks/${task.id}/synthesis`);
          const synth = sr.ok ? ((await sr.json()) as { synthesis: string; proof: ProofPart }) : null;
          synthVerification = verifySynthesis(task.final_report_hash, report, synth);
        }
        if (alive) setSt({ state: "ready", view: { task: slim, slotVerified, slotVerification: slots, plan, report, reportVerified, synthVerification, loadedAt: new Date() } });
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
