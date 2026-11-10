// The agent loop: find my open slots → brief → GATHER + WRITE → quality gate →
// submit on-chain (signed by the agent) → post text + proofs to the coordinator.
import { config } from "./config.ts";
import { getBrief, postResult } from "./coordinator.ts";
import { getAllTasks, getTask, submitContribution, type Task } from "./near.ts";
import { answer, proofRefFor, type Trace } from "./nearai.ts";
import * as state from "./state.ts";
import { errMsg, log, logErr, retry, sha256 } from "./util.ts";

export const MAX_ATTEMPTS = 2;
/** Rough worst case for one GATHER+WRITE attempt; an attempt won't start if it could break the limit. */
const ATTEMPT_RESERVE_USD = 0.03;
const warned = new Set<string>();
const warnOnce = (k: string, msg: string) => {
  if (!warned.has(k)) {
    warned.add(k);
    logErr(msg);
  }
};
let running = false;

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const tasks = (await getAllTasks()).filter(
      (t) => (t.status === "InProgress" || t.status === "Submitted") && !config.skipTaskIds.has(t.id),
    );
    for (const task of tasks) {
      for (const [i, slot] of task.slots.entries()) {
        if (slot.agent_id !== config.agentId) continue;
        const k = state.key(task.id, i);
        const s = state.get(k);
        if (s?.stage === "posted" || s?.stage === "failed") continue;

        if (slot.result_hash === null) {
          if (task.status !== "InProgress" || BigInt(task.deadline) <= nowNs) continue; // U2
          await work(task, i);
        } else if (s?.result_hash === slot.result_hash) {
          await post(task.id, i); // submitted earlier (maybe before a crash), not yet posted
        } else {
          warnOnce(k, `task=${task.id} slot=${i} is submitted on-chain with a result this agent did not store; skipping`);
        }
      }
    }
  } catch (e) {
    logErr(`tick failed: ${errMsg(e)}`);
  } finally {
    running = false;
  }
}

async function work(task: Task, slot: number) {
  const k = state.key(task.id, slot);
  const tag = `task=${task.id} slot=${slot}`;
  const s0 = state.get(k);

  // 1. Answer — at most MAX_ATTEMPTS AI attempts per slot, ever (persisted).
  if (!s0 || s0.stage === "pending") {
    const attempt = (s0?.attempts ?? 0) + 1;
    if (attempt > MAX_ATTEMPTS) {
      state.set(k, { stage: "failed" });
      logErr(`${tag} GIVING UP after ${MAX_ATTEMPTS} attempts`);
      return;
    }
    if (!config.dryRun && state.spent() + ATTEMPT_RESERVE_USD > config.spendLimitUsd) {
      warnOnce(
        `budget:${k}`,
        `${tag} BUDGET: spent ~$${state.spent().toFixed(4)} of $${config.spendLimitUsd}; not starting another attempt`,
      );
      return;
    }
    state.set(k, { stage: "pending", attempts: attempt }); // count the attempt before spending
    log(`${tag} attempt ${attempt}/${MAX_ATTEMPTS} ("${task.title}") — fetching brief`);
    const trace: Trace = {
      raws: {},
      addCost: (usd) => state.addSpend(usd),
    };
    try {
      const { brief } = await retry(`${tag} get brief`, () => getBrief(task.id, slot));
      const t0 = Date.now();
      const a = await answer(brief, trace, (m) => log(`${tag} ${m}`));
      const resultHash = sha256(a.text);
      const proofRef = proofRefFor(a.proof);
      log(
        `${tag} report OK: ${a.text.length} chars in ${((Date.now() - t0) / 1000).toFixed(1)}s, ` +
          `passes quality gate; total spend ~$${state.spent().toFixed(4)}`,
      );
      state.set(k, { stage: "answered", text: a.text, result_hash: resultHash, proof: a.proof, proof_ref: proofRef });
    } catch (e) {
      const msg = errMsg(e);
      const saved = state.saveFailure(k, attempt, trace.raws, msg);
      logErr(`${tag} attempt ${attempt} failed: ${msg} (raw saved: ${saved}-*)`);
      if (attempt >= MAX_ATTEMPTS) {
        state.set(k, { stage: "failed", last_error: msg });
        logErr(`${tag} GIVING UP after ${MAX_ATTEMPTS} attempts; total spend ~$${state.spent().toFixed(4)}`);
      } else {
        state.set(k, { last_error: msg });
      }
      return;
    }
  }

  // 2. Submit on-chain, signed by the agent.
  const s = state.get(k)!;
  if (s.stage === "answered") {
    try {
      const tx = await retry(`${tag} submit_contribution`, async () => {
        try {
          return await submitContribution(task.id, slot, s.result_hash!, s.proof_ref!);
        } catch (e) {
          if (errMsg(e).includes("slot already submitted")) return "already-submitted";
          throw e;
        }
      });
      if (tx === "already-submitted") {
        const onChain = (await getTask(task.id))?.slots[slot]?.result_hash;
        if (onChain !== s.result_hash) {
          logErr(`${tag} contract says already submitted, with a different hash (${onChain}); not posting`);
          state.set(k, { stage: "failed", last_error: "already submitted with a different hash" });
          return;
        }
        log(`${tag} was already submitted with our hash (earlier run) — continuing`);
        state.set(k, { stage: "submitted" });
      } else {
        log(`${tag} SUBMITTED result_hash=${s.result_hash} proof_ref=${s.proof_ref} tx=${tx}`);
        state.set(k, { stage: "submitted", submit_tx: tx });
      }
    } catch (e) {
      logErr(`${tag} ${errMsg(e)} — will retry next tick`);
      return;
    }
  }

  // 3. Hand the full text + proofs to the coordinator.
  await post(task.id, slot);
}

async function post(taskId: number, slot: number) {
  const k = state.key(taskId, slot);
  const s = state.get(k)!;
  const tag = `task=${taskId} slot=${slot}`;
  try {
    // 409 right after submit = coordinator's RPC not caught up yet; the retry covers it.
    const r = await retry(`${tag} post result`, () => postResult(taskId, slot, s.text!, s.proof!), 4);
    log(`${tag} POSTED result to coordinator (${JSON.stringify(r.proof_kinds)})`);
    state.set(k, { stage: "posted" });
  } catch (e) {
    logErr(`${tag} ${errMsg(e)} — will retry next tick`);
  }
}

export function start() {
  log(
    `${config.agentId} on ${config.contractId}, model=${config.model}, web_search(GATHER)=${config.webSearch}, ` +
      `write_max_tokens=${config.writeMaxTokens}, spend limit $${config.spendLimitUsd} (spent ~$${state.spent().toFixed(4)})` +
      (config.skipTaskIds.size ? `, skipping tasks ${[...config.skipTaskIds].join(",")}` : "") +
      (config.dryRun ? ", DRY_RUN=true (placeholder answers, no AI)" : ""),
  );
  void tick();
  setInterval(() => void tick(), config.pollIntervalMs);
}
