// Stage 3.4: SYNTHESIS (one NEAR AI call, provider_tee signed) + ASSEMBLY (plain code)
// of a task's final report.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { sha256 } from "./hash.ts";
import type { Agent, Task } from "./near.ts";
import type { Proof, ProofPart } from "./proof.ts";

const BASE = "https://cloud-api.near.ai/v1";
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

export function synthesisProblems(s: string, finish: string | null): string[] {
  const p: string[] = [];
  const lines = s.split("\n").map((l) => l.trim());
  for (const h of SYNTH_HEADINGS) if (!lines.includes(h)) p.push(`missing heading "${h}"`);
  if (s.length < MIN_SYNTH_CHARS) p.push(`only ${s.length} chars (< ${MIN_SYNTH_CHARS})`);
  if (finish !== "stop") p.push(`finish_reason=${finish} (not stop)`);
  return p;
}

const headers = () => ({
  Authorization: `Bearer ${config.nearAiKey}`,
  "Content-Type": "application/json",
  "Accept-Encoding": "identity",
  "x-no-aliasing": "true", // required for provider_tee signatures
});

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
  const reports = contributions
    .map(
      (c) =>
        `===== Report from ${c.agent.name} (${c.agent.agent_id}, role: ${c.role}) =====\n\n${c.text}\n\n===== End of ${c.agent.name} report =====`,
    )
    .join("\n\n");
  const body = {
    model: config.model,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: `Task title: ${task.title}\n\n${reports}` },
    ],
    max_tokens: config.synthMaxTokens,
    chat_template_kwargs: { thinking: false, enable_thinking: false },
  };
  const requestBody = JSON.stringify(body);
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: requestBody,
    signal: AbortSignal.timeout(180_000),
  });
  const raw = Buffer.from(await res.arrayBuffer()).toString("utf8");
  raws.synthesis = raw;
  if (res.status !== 200) throw new Error(`SYNTHESIS HTTP ${res.status}: ${raw.slice(0, 300)}`);
  const j = JSON.parse(raw);
  const u = j.usage ?? {};
  const cost = ((u.prompt_tokens ?? 0) * config.priceInPerM + (u.completion_tokens ?? 0) * config.priceOutPerM) / 1e6;
  addCost(cost);
  const content: string = j.choices?.[0]?.message?.content ?? "";
  const finish: string | null = j.choices?.[0]?.finish_reason ?? null;
  log(`SYNTHESIS ${content.length} chars, finish=${finish}, usage=${JSON.stringify(u)}, ~$${cost.toFixed(4)}`);

  const text = extractSynthesis(content);
  if (text === null) throw new Error('SYNTHESIS: no "## Executive Summary" heading');
  const problems = synthesisProblems(text, finish);
  if (problems.length) throw new Error(`synthesis quality gate failed: ${problems.join("; ")}`);

  const proof = await signed(j.id, requestBody, raw);
  if (proof.kind !== "provider_tee") throw new Error(`synthesis signature kind is ${proof.kind}, expected provider_tee`);
  return { text, proof };
}

async function signed(chatId: string, requestBody: string, raw: string): Promise<ProofPart> {
  const url = `${BASE}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(config.model)}&signing_algo=ecdsa`;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`signature HTTP ${res.status}: ${body.slice(0, 200)}`);
    const s = JSON.parse(body);
    if (!s.signature || !s.signing_address || !s.text) throw new Error(`signature unavailable: ${body.slice(0, 200)}`);
    const parts = String(s.text).split(":");
    if (parts.at(-1) !== sha256(raw)) throw new Error("signature's response hash does not match the bytes received");
    if (parts.at(-2) !== sha256(requestBody)) throw new Error("signature's request hash does not match the bytes sent");
    return {
      kind: s.signature_kind,
      signature: s.signature,
      signed_text: s.text,
      signing_address: s.signing_address,
      chat_id: chatId,
      model: config.model,
      request_body: requestBody,
      raw_response: raw,
    };
  }
  throw new Error("signature not available after 10 polls (404)");
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
