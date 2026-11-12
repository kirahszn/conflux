"use client";
// Task 3 showcase: starts from the committed snapshot (src/data/task3.json) and switches to live
// coordinator data when the coordinator is reachable. Both are real data; the label says which.
import { useEffect, useState } from "react";
import snapshot from "@/data/task3.json";
import { CONTRACT_ID, COORDINATOR_URL, network } from "./near";
import { buildShowcase, type CoordPlanInput, type CoordTaskInput, type Showcase } from "./showcase";
import { useChainData } from "./useChainData";

/** The example task, or null on networks without one (mainnet). */
export const SHOWCASE_TASK_ID = network.showcase?.taskId ?? null;

async function get(path: string): Promise<Response> {
  if (!COORDINATOR_URL) throw new Error("no coordinator configured for this network");
  const r = await fetch(`${COORDINATOR_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

export function useShowcase(): Showcase | null {
  const { data } = useChainData();
  const [live, setLive] = useState<Showcase | null>(null);
  const ready = data.state === "ready";

  useEffect(() => {
    if (data.state !== "ready" || SHOWCASE_TASK_ID === null) return;
    let alive = true;
    Promise.all([
      get(`/tasks/${SHOWCASE_TASK_ID}`).then((r) => r.json() as Promise<CoordTaskInput>),
      get(`/tasks/${SHOWCASE_TASK_ID}/plan`).then((r) => r.json() as Promise<CoordPlanInput>),
      get(`/tasks/${SHOWCASE_TASK_ID}/report`).then((r) => r.text()),
    ])
      .then(([task, plan, report]) => {
        if (!alive) return;
        setLive(buildShowcase({ source: "live", contractId: CONTRACT_ID, coordinator: data.coordinator, task, plan, report, agents: data.agents }));
      })
      .catch(() => {
        /* coordinator unreachable: keep the snapshot */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (SHOWCASE_TASK_ID === null) return null;
  return live ?? (snapshot as Showcase);
}
