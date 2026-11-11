"use client";
// Loads agents + tasks from the contract with loading / error / retry state.
import { useCallback, useEffect, useState } from "react";
import { getAllAgents, getAllTasks, type Agent, type Task } from "./near";

export type ChainData =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; agents: Agent[]; tasks: Task[]; loadedAt: Date };

export function useChainData() {
  const [data, setData] = useState<ChainData>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setData({ state: "loading" });
    Promise.all([getAllAgents(ctrl.signal), getAllTasks(ctrl.signal)])
      .then(([agents, tasks]) => setData({ state: "ready", agents, tasks, loadedAt: new Date() }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setData({ state: "error", message: e instanceof Error ? e.message : "Unknown error" });
      });
    return () => ctrl.abort();
  }, [nonce]);

  return { data, retry };
}
