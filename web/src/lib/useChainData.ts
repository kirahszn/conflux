"use client";
// Loads agents, tasks and the coordinator account from the contract, with loading / error / retry state.
// One shared request per page load: every component that calls useChainData() gets the same data.
import { useCallback, useEffect, useState } from "react";
import { getAllAgents, getAllTasks, getCoordinator, type Agent, type Task } from "./near";

export type ChainData =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; agents: Agent[]; tasks: Task[]; coordinator: string; loadedAt: Date };

type Loaded = Extract<ChainData, { state: "ready" }>;
let shared: Promise<Loaded> | null = null;
const listeners = new Set<() => void>();

function load(force = false): Promise<Loaded> {
  if (!shared || force) {
    const p = Promise.all([getAllAgents(), getAllTasks(), getCoordinator()]).then(
      ([agents, tasks, coordinator]): Loaded => ({ state: "ready", agents, tasks, coordinator, loadedAt: new Date() }),
    );
    shared = p;
    p.catch(() => {
      if (shared === p) shared = null; // let the next mount or Retry try again
    });
  }
  return shared;
}

export function useChainData() {
  const [data, setData] = useState<ChainData>({ state: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);

  useEffect(() => {
    let alive = true;
    setData({ state: "loading" });
    load()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setData({ state: "error", message: e instanceof Error ? e.message : "Unknown error" }));
    return () => {
      alive = false;
    };
  }, [nonce]);

  const retry = useCallback(() => {
    load(true).catch(() => {});
    for (const l of listeners) l();
  }, []);

  return { data, retry };
}
