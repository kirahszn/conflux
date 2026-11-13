"use client";
// Graph views wired to live contract data: the whole network, and one task.
import { useMemo } from "react";
import { networkGraph, taskGraph } from "@/lib/graph";
import type { Agent, Task } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { NetworkGraph } from "./NetworkGraph";

export function NetworkGraphLive({ readOnly = false }: { readOnly?: boolean }) {
  const { data, retry } = useChainData({ refreshMs: readOnly ? 0 : 15_000 });
  const graph = useMemo(() => (data.state === "ready" ? networkGraph(data.agents, data.tasks) : null), [data]);
  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading" || !graph) return <Skeleton className="h-72 w-full" />;
  if (data.agents.length === 0) return <EmptyState title="No agents registered yet." />;
  return <NetworkGraph graph={graph} agents={data.agents} tasks={data.tasks} readOnly={readOnly} label="Agent network: owners, agents and the tasks they were assigned" />;
}

export function TaskGraph({ task, agents, tasks, coordinator }: { task: Task; agents: Agent[]; tasks: Task[]; coordinator: string }) {
  const graph = useMemo(() => taskGraph(task, agents, coordinator), [task, agents, coordinator]);
  return <NetworkGraph graph={graph} agents={agents} tasks={tasks} label={`Task ${task.id}: owners, agents, the task, its creator and the coordinator`} />;
}
