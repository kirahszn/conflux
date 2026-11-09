// Every WATCH_INTERVAL_MS: assign unassigned slots of open tasks to matching agents.
import { config } from "./config.ts";
import { call, getAllAgents, getAllTasks } from "./near.ts";
import { store } from "./store.ts";

/** "task:slot" pairs already reported as having no match, so the log isn't spammed every tick. */
const reportedNoMatch = new Set<string>();
let running = false;

export async function tick(): Promise<void> {
  if (running) return; // previous tick still sending transactions
  running = true;
  try {
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const tasks = (await getAllTasks()).filter(
      (t) => t.status === "Funded" || t.status === "InProgress",
    );
    const open = tasks.filter((t) => {
      if (BigInt(t.deadline) <= nowNs) return false; // expired: contract would reject (G3)
      if (!t.slots.some((s) => s.agent_id === null)) return false;
      if (store.description(t.id) === undefined) return false; // wait for description
      return true;
    });
    if (open.length === 0) return;

    const agents = (await getAllAgents()).filter((a) => a.active);
    for (const task of open) {
      for (const [i, slot] of task.slots.entries()) {
        if (slot.agent_id !== null) continue;
        const key = `${task.id}:${i}`;
        const agent = agents.find((a) => a.capabilities.includes(slot.role));
        if (!agent) {
          if (!reportedNoMatch.has(key)) {
            console.warn(
              `[watcher] NO MATCH task=${task.id} slot=${i} role="${slot.role}": no active agent has this capability`,
            );
            reportedNoMatch.add(key);
          }
          continue;
        }
        try {
          const tx = await call("assign_slot", {
            task_id: task.id,
            slot_index: i,
            agent_id: agent.agent_id,
          });
          reportedNoMatch.delete(key);
          console.log(
            `[watcher] ASSIGNED task=${task.id} slot=${i} role="${slot.role}" -> ${agent.agent_id} (${agent.name}) tx=${tx}`,
          );
        } catch (err) {
          console.error(`[watcher] assign failed task=${task.id} slot=${i}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  } catch (err) {
    console.error("[watcher] tick failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startWatcher(): void {
  console.log(`[watcher] polling ${config.contractId} every ${config.watchIntervalMs / 1000}s`);
  void tick();
  setInterval(() => void tick(), config.watchIntervalMs);
}
