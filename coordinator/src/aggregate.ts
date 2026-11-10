// Stage 3.4: for Submitted tasks without a final report: check stored results →
// SYNTHESIS → ASSEMBLY → save → set_final_report on-chain (as the coordinator).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.ts";
import { sha256 } from "./hash.ts";
import { call, getAgent, getTask, type Task } from "./near.ts";
import { qualityProblems } from "./report.ts";
import { store } from "./store.ts";
import { assemble, synthesize, type Contribution, type SynthesisResult } from "./synthesis.ts";

export const MAX_SYNTH_ATTEMPTS = 2;
const ATTEMPT_RESERVE_USD = 0.01; // rough worst case for one synthesis call
const warned = new Set<string>();
const warnOnce = (k: string, m: string) => {
  if (!warned.has(k)) {
    warned.add(k);
    console.warn(m);
  }
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function aggregate(task: Task): Promise<void> {
  const tag = `[aggregate] task=${task.id}`;
  let row = store.finalReport(task.id);
  if (row?.status === "failed" || row?.status === "set") return;

  // 1. Every slot: stored result whose hash is on-chain and which passes the quality gate.
  if (!row || row.status === "pending") {
    const stored = store.results(task.id);
    const contributions: Contribution[] = [];
    for (const [i, slot] of task.slots.entries()) {
      const r = stored.get(i);
      if (!r || !slot.result_hash || !slot.agent_id) return warnOnce(`${task.id}:wait:${i}`, `${tag} waiting: no stored result for slot ${i}`);
      if (sha256(r.text) !== slot.result_hash) return warnOnce(`${task.id}:hash:${i}`, `${tag} slot ${i}: stored text does not match on-chain result_hash — not aggregating`);
      const problems = qualityProblems(r.text, slot.role);
      if (problems.length) return warnOnce(`${task.id}:gate:${i}`, `${tag} slot ${i} fails the quality gate (${problems.join("; ")}) — not aggregating`);
      const agent = await getAgent(slot.agent_id);
      if (!agent) return warnOnce(`${task.id}:agent:${i}`, `${tag} slot ${i}: agent ${slot.agent_id} not found`);
      contributions.push({ slot: i, role: slot.role, reward: slot.reward, agent, resultHash: slot.result_hash, proofRef: slot.proof_ref, text: r.text, proof: r.proof as Contribution["proof"] });
    }

    // 2. SYNTHESIS — max 2 attempts per task, spend cap across all tasks.
    const attempt = (row?.attempts ?? 0) + 1;
    if (attempt > MAX_SYNTH_ATTEMPTS) {
      store.setFinalReport(task.id, { status: "failed" });
      return console.error(`${tag} GIVING UP after ${MAX_SYNTH_ATTEMPTS} synthesis attempts`);
    }
    if (store.synthSpent() + ATTEMPT_RESERVE_USD > config.synthSpendLimitUsd) {
      return warnOnce(`${task.id}:budget`, `${tag} BUDGET: synthesis spend ~$${store.synthSpent().toFixed(4)} of $${config.synthSpendLimitUsd}; not starting`);
    }
    store.setFinalReport(task.id, { status: "pending", attempts: attempt }); // count before spending
    console.log(`${tag} SYNTHESIS attempt ${attempt}/${MAX_SYNTH_ATTEMPTS} over ${contributions.length} reports`);
    const raws: Record<string, string> = {};
    let synth: SynthesisResult;
    try {
      synth = await synthesize(task, contributions, (usd) => store.addSynthSpend(usd), (m) => console.log(`${tag} ${m}`), raws);
    } catch (e) {
      const msg = errMsg(e);
      const dir = join(dirname(config.dbPath), "failures");
      mkdirSync(dir, { recursive: true });
      const base = join(dir, `synthesis-task${task.id}-attempt${attempt}`);
      writeFileSync(`${base}-error.txt`, msg + "\n");
      for (const [k, v] of Object.entries(raws)) writeFileSync(`${base}-${k}.raw`, v);
      console.error(`${tag} synthesis attempt ${attempt} failed: ${msg} (raw saved: ${base}-*)`);
      const failed = attempt >= MAX_SYNTH_ATTEMPTS;
      store.setFinalReport(task.id, { status: failed ? "failed" : "pending", last_error: msg });
      if (failed) console.error(`${tag} GIVING UP after ${MAX_SYNTH_ATTEMPTS} synthesis attempts`);
      return;
    }

    // 3. ASSEMBLY — saved with its hash BEFORE the transaction (crash-safe, never re-synthesized).
    const report = assemble(task, contributions, synth);
    const hash = sha256(report);
    store.setFinalReport(task.id, { status: "ready", report, report_hash: hash, synthesis: synth.text, proof: synth.proof });
    console.log(`${tag} final report assembled: ${report.length} chars, sha256=${hash}; synthesis signed ${synth.proof.kind} by ${synth.proof.signing_address}; total synthesis spend ~$${store.synthSpent().toFixed(4)}`);
    row = store.finalReport(task.id)!;
  }

  // 4. set_final_report on-chain.
  if (row.status === "ready") {
    try {
      const tx = await call("set_final_report", { task_id: task.id, report_hash: row.report_hash });
      store.setFinalReport(task.id, { status: "set", tx });
      console.log(`${tag} SET final_report_hash=${row.report_hash} tx=${tx}`);
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes("final report already set")) {
        const onChain = (await getTask(task.id))?.final_report_hash;
        if (onChain === row.report_hash) {
          store.setFinalReport(task.id, { status: "set" });
          return console.log(`${tag} final report was already set with our hash`);
        }
        store.setFinalReport(task.id, { status: "failed", last_error: `on-chain hash ${onChain} differs` });
        return console.error(`${tag} on-chain final_report_hash ${onChain} differs from ours — not retrying`);
      }
      console.error(`${tag} set_final_report failed: ${msg} — will retry next tick`);
    }
  }
}
