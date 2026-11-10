// Stage 3.4: SYNTHESIS (one NEAR AI call, provider_tee signed) + ASSEMBLY (plain code)
// of a task's final report.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import type { Agent, Task } from "./near.ts";
import { complete, signed } from "./nearai.ts";
import type { Proof, ProofPart } from "./proof.ts";
const PROMPT = readFileSync(join(import.meta.dirname, "..", "prompts", "synthesis.md"), "utf8");
export const SYNTH_HEADINGS = [
  "## Executive Summary",
  "## Where the Agents Agree",
  "## Where the Agents Disagree",
  "## Open Questions",
];
export const MIN_SYNTH_CHARS = 800;

export interface Contribution {
  slot: number;
  role: string;
  reward: string; // yocto
  agent: Agent;
  resultHash: string;
  proofRef: string | null;
  text: string;
  proof: Proof | null;
}

/** Synthesis = content from its "## Executive Summary" line onward (drops any preamble/title). */
export function extractSynthesis(content: string): string | null {
  const m = /^## Executive Summary[ \t]*$/m.exec(content);
  return m ? content.slice(m.index).trimEnd() : null;
}

export function synthesisProblems(s: string, finish: string | null, agentNames: string[] = []): string[] {
  const p: string[] = [];
  for (const n of agentNames) if (!s.includes(n)) p.push(`agent name "${n}" never used`);
  const lines = s.split("\n").map((l) => l.trim());
  for (const h of SYNTH_HEADINGS) if (!lines.includes(h)) p.push(`missing heading "${h}"`);
  if (s.length < MIN_SYNTH_CHARS) p.push(`only ${s.length} chars (< ${MIN_SYNTH_CHARS})`);
  if (finish !== "stop") p.push(`finish_reason=${finish} (not stop)`);
  return p;
}

export interface SynthesisResult {
  text: string;
  proof: ProofPart;
}

/** One SYNTHESIS attempt. `addCost` is called as soon as usage is known (even if the gate fails). */
export async function synthesize(
  task: Task,
  contributions: Contribution[],
  addCost: (usd: number) => void,
  log: (m: string) => void,
  raws: Record<string, string>,
): Promise<SynthesisResult> {
  const names = contributions.map((c) => c.agent.name);
  const reports = contributions
    .map(
      (c) =>
        `===== Report from ${c.agent.name} (${c.agent.agent_id}, role: ${c.role}) =====\n\n${c.text}\n\n===== End of ${c.agent.name} report =====`,
    )
    .join("\n\n");
  const user =
    `Task title: ${task.title}\n\n` +
    `Agent names — use exactly these names in every attribution, never shortened: ${names.map((n) => `"${n}"`).join(", ")}\n\n` +
    reports;
  const c = await complete("synthesis", PROMPT, user, config.synthMaxTokens, raws);
  addCost(c.costUsd);
  log(`SYNTHESIS ${c.content.length} chars, finish=${c.finish}, usage=${JSON.stringify(c.usage)}, ~$${c.costUsd.toFixed(4)}`);

  const text = extractSynthesis(c.content);
  if (text === null) throw new Error('SYNTHESIS: no "## Executive Summary" heading');
  const problems = synthesisProblems(text, c.finish, names);
  if (problems.length) throw new Error(`synthesis quality gate failed: ${problems.join("; ")}`);
  return { text, proof: await signed(c, "provider_tee") };
}

// ---- ASSEMBLY (no AI) ------------------------------------------------------

/** Push markdown headings down by `levels` (max ######). Leaves fenced code untouched. */
export function demote(md: string, levels: number): string {
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (inFence) return line;
      const m = /^(#{1,6})(\s.*)$/.exec(line);
      return m ? "#".repeat(Math.min(6, m[1]!.length + levels)) + m[2] : line;
    })
    .join("\n");
}

const near = (yocto: string) => {
  const s = (BigInt(yocto) * 10_000n) / 10n ** 24n; // 4 decimals
  return `${s / 10_000n}.${(s % 10_000n).toString().padStart(4, "0")} NEAR`;
};

const proofKinds = (p: Proof | null) =>
  p === null ? "none" : "kind" in p ? "dry run (no AI)" : `gather: ${p.gather?.kind ?? "none"}, write: ${p.write.kind}`;

export function assemble(task: Task, contributions: Contribution[], synth: SynthesisResult): string {
  const out: string[] = [];
  out.push(`# Conflux Final Report: ${task.title}`, "");
  out.push("## Synthesis — Conflux Coordinator, NEAR AI provider_tee signed", "");
  out.push(demote(synth.text, 1), "");
  out.push("## Contributions", "");
  for (const c of contributions) {
    out.push(`### ${c.agent.name} — ${c.role}`, "");
    out.push(`- **Agent account:** \`${c.agent.agent_id}\``);
    out.push(`- **Owner (paid):** \`${c.agent.owner}\``);
    out.push(`- **Role:** ${c.role}`);
    out.push(`- **Reward:** ${near(c.reward)}`);
    out.push(`- **On-chain result_hash:** \`${c.resultHash}\``);
    out.push(`- **Proof kinds:** ${proofKinds(c.proof)}`);
    out.push(`- **proof_ref:** \`${c.proofRef ?? "none"}\``, "");
    out.push(demote(c.text.trimEnd(), 3), "");
  }
  out.push("## Verification", "");
  out.push(`- **Contract:** \`${config.contractId}\` (NEAR testnet)`);
  out.push(`- **Task id:** ${task.id}`);
  for (const c of contributions) {
    out.push(
      `- **Slot ${c.slot} (${c.role}) result_hash:** \`${c.resultHash}\` = sha256 of the agent's original report ` +
        `(headings not demoted), served as \`slots[${c.slot}].result\` by \`GET /tasks/${task.id}\``,
    );
  }
  out.push(`- **Synthesis chat_id:** \`${synth.proof.chat_id}\``);
  out.push(`- **Synthesis signing address:** \`${synth.proof.signing_address}\` (${synth.proof.kind}, ${synth.proof.model})`);
  out.push(
    "- **final_report_hash** (on-chain, set by the coordinator) = sha256 of this whole document as served by `GET /tasks/" +
      `${task.id}/report\`.`,
  );
  return out.join("\n") + "\n";
}
