"use client";
// Loads agents, tasks and the coordinator account from the contract, with loading / error / retry state.
// One shared request for the whole app: every component that calls useChainData() gets the same data.
// Polling (refreshMs) and refreshChainData() reload in the background without flashing a loading state.
import { useCallback, useEffect, useState } from "react";
import { getAllAgents, getAllTasks, getCoordinator, getTask, type Agent, type Task } from "./near";

export type ChainData =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; agents: Agent[]; tasks: Task[]; coordinator: string; loadedAt: Date };

type Loaded = Extract<ChainData, { state: "ready" }>;
let shared: Promise<Loaded> | null = null;
let last: ChainData = { state: "loading" };
const listeners = new Set<(d: ChainData) => void>();

function publish(d: ChainData) {
  last = d;
  for (const l of listeners) l(d);
}

function load(force = false): Promise<Loaded> {
  if (!shared || force) {
    const p = Promise.all([getAllAgents(), getAllTasks(), getCoordinator()]).then(
      ([agents, tasks, coordinator]): Loaded => ({ state: "ready", agents, tasks, coordinator, loadedAt: new Date() }),
    );
    shared = p;
    p.then(publish, (e: unknown) => {
      if (shared === p) shared = null; // let the next mount or Retry try again
      // Keep showing the last good data during background refreshes; only surface errors when there is none.
      if (last.state !== "ready") publish({ state: "error", message: e instanceof Error ? e.message : "Unknown error" });
    });
  }
  return shared;
}

/** Reload agents and tasks now (e.g. after a transaction). */
export function refreshChainData() {
  return load(true).catch(() => {});
}

export function useChainData(opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<ChainData>(last);

  useEffect(() => {
    listeners.add(setData);
    setData(last);
    load().catch(() => {});
    return () => void listeners.delete(setData);
  }, []);

  useEffect(() => {
    if (!opts.refreshMs) return;
    const t = setInterval(() => void refreshChainData(), opts.refreshMs);
    return () => clearInterval(t);
  }, [opts.refreshMs]);

  const retry = useCallback(() => {
    if (last.state !== "ready") publish({ state: "loading" });
    void refreshChainData();
  }, []);

  return { data, retry };
}

export type TaskData = { state: "loading" } | { state: "error"; message: string } | { state: "missing" } | { state: "ready"; task: Task; loadedAt: Date };

/** One task, polled every `refreshMs` (default 5s). Keeps the last good value during refreshes. */
export function useTask(id: number | null, refreshMs = 5000) {
  const [data, setData] = useState<TaskData>({ state: "loading" });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    const run = () =>
      getTask(id)
        .then((t) => alive && setData(t ? { state: "ready", task: t, loadedAt: new Date() } : { state: "missing" }))
        .catch((e: unknown) => alive && setData((d) => (d.state === "ready" ? d : { state: "error", message: e instanceof Error ? e.message : "Unknown error" })));
    void run();
    const t = setInterval(run, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, refreshMs, nonce]);

  return { data, reload };
}
