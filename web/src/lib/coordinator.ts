"use client";
// Optional extras from the coordinator API (proofs and synthesis). If the coordinator is not
// reachable, this returns { reachable: false } and the UI simply leaves those cards out.
import { useEffect, useState } from "react";
import { parseDisagreement } from "./disagree";
import { COORDINATOR_URL, type Agent, type Task } from "./near";

export interface ProofInfo {
  taskId: number;
  slot: number;
  role: string;
  agentId: string;
  kind: string;
  model: string;
}
export interface Disagreement {
  taskId: number;
  topic: string;
  text: string;
  reportUrl: string;
}
export type Extras = { state: "loading" } | { state: "done"; reachable: boolean; proofs: ProofInfo[]; disagreement: Disagreement | null };

interface CoordTask {
  slots: { role: string; agent_id: string | null; proof: { write?: { kind?: string; model?: string } } | null }[];
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${COORDINATOR_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
async function getText(path: string): Promise<string> {
  const r = await fetch(`${COORDINATOR_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export function useCoordinatorExtras(tasks: Task[] | null, agents: Agent[] | null): Extras {
  const [extras, setExtras] = useState<Extras>({ state: "loading" });
  const key = tasks ? tasks.map((t) => `${t.id}:${t.status}`).join(",") : "";

  useEffect(() => {
    if (!tasks || !agents) return;
    let alive = true;
    const settled = tasks.filter((t) => t.status === "Settled").sort((a, b) => b.id - a.id).slice(0, 2);
    (async () => {
      try {
        await getJson("/health");
      } catch {
        if (alive) setExtras({ state: "done", reachable: false, proofs: [], disagreement: null });
        return;
      }
      const proofs: ProofInfo[] = [];
      const seenRoles = new Set<string>();
      let disagreement: Disagreement | null = null;
      for (const t of settled) {
        try {
          const ct = await getJson<CoordTask>(`/tasks/${t.id}`);
          ct.slots.forEach((s, i) => {
            const w = s.proof?.write;
            if (!w?.kind || !w.model || !s.agent_id || seenRoles.has(s.role)) return;
            seenRoles.add(s.role);
            proofs.push({ taskId: t.id, slot: i, role: s.role, agentId: s.agent_id, kind: w.kind, model: w.model });
          });
        } catch {
          /* skip this task */
        }
        if (!disagreement && t.final_report_hash) {
          try {
            const md = await getText(`/tasks/${t.id}/report`);
            const d = parseDisagreement(md, agents.map((a) => a.name));
            if (d) disagreement = { taskId: t.id, ...d, reportUrl: `${COORDINATOR_URL}/tasks/${t.id}/report` };
          } catch {
            /* skip */
          }
        }
      }
      if (alive) setExtras({ state: "done", reachable: true, proofs, disagreement });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, agents]);

  return extras;
}
