// Stage 3.5: AI task planning. One NEAR AI call proposes roles, reasons, rewards and
// tailored briefs; plain code validates roles and fixes the numbers exactly in yoctoNEAR.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { sha256 } from "./hash.ts";
import { getAllAgents } from "./near.ts";
import { complete, signed } from "./nearai.ts";
import type { ProofPart } from "./proof.ts";
import { store } from "./store.ts";

const PROMPT = readFileSync(join(import.meta.dirname, "..", "prompts", "plan.md"), "utf8");
export const MAX_PLAN_ATTEMPTS = 2;
const PLAN_MAX_TOKENS = 2500;
const ATTEMPT_RESERVE_USD = 0.005; // rough worst case for one planning call
const YOCTO = 10n ** 24n;
const STORAGE_ALLOWANCE = 5n * 10n ** 22n; // 0.05 NEAR on top of the budget; contract refunds the excess (S3)
const MAX_SLOTS = 10;
const MAX_BRIEF_CHARS = 2000;

export interface PlanSlot {
  role: string;
  reason: string;
  reward: string; // yocto
  reward_near: string;
  brief: string;
  agents: string[]; // names of active agents holding this role
}
export interface Plan {
  title: string;
  description: string;
  description_hash: string;
  budget: string; // yocto
  coordinator_fee: string; // yocto, 10% of budget
  slots: PlanSlot[];
  fixes: string[];
  create_task: {
    contract_id: string;
    method: "create_task";
    args: {
      title: string;
      description_hash: string;
      slots: { role: string; reward: string }[];
      coordinator_fee: string;
      deadline: string; // ns
    };
    attached_deposit: string; // yocto: budget + 0.05 NEAR storage allowance (excess refunded)
    deadline_iso: string;
  };
  proof: ProofPart;
  created_at: string;
}

export class PlanError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** "0.4" / 0.4 → yocto, exact (no floating point). */
export function nearToYocto(v: unknown): bigint {
  const s = typeof v === "number" ? v.toString() : typeof v === "string" ? v.trim() : "";
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(s);
  if (!m) throw new PlanError(400, "budget_near must be a positive decimal number of NEAR (max 24 decimals)");
  return BigInt(m[1]!) * YOCTO + BigInt((m[2] ?? "").padEnd(24, "0") || "0");
}
export function yoctoToNear(y: bigint): string {
  const whole = y / YOCTO;
  const frac = (y % YOCTO).toString().padStart(24, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Scale proposed weights so that the slot rewards sum to exactly `pool` yocto.
 * Non-positive/invalid weights → equal split. Rounding dust goes to the largest slot.
 */
export function distribute(weights: number[], pool: bigint, fixes: string[]): bigint[] {
  let w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : NaN));
  if (w.some(Number.isNaN)) {
    fixes.push("some proposed rewards were missing or not positive: split the slot pool equally");
    w = w.map(() => 1);
  }
  const total = w.reduce((a, b) => a + b, 0);
  // Work in 0.0001 NEAR units so rewards are round numbers; remainder goes to the largest slot.
  const UNIT = 10n ** 20n;
  const poolUnits = pool / UNIT;
  if (poolUnits < BigInt(w.length)) throw new PlanError(400, "budget too small for this many slots");
  const units = w.map((x) => {
    const u = BigInt(Math.round((x / total) * Number(poolUnits)));
    return u < 1n ? 1n : u;
  });
  const maxI = units.indexOf(units.reduce((a, b) => (b > a ? b : a)));
  units[maxI]! += poolUnits - units.reduce((a, b) => a + b, 0n); // fix rounding drift
  const out = units.map((u) => u * UNIT);
  out[maxI]! += pool - poolUnits * UNIT; // sub-unit dust
  if (out.some((r) => r <= 0n)) throw new PlanError(500, "reward distribution produced a zero reward");
  return out;
}

export async function createPlan(body: unknown): Promise<Plan> {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const description = typeof b.description === "string" ? b.description : "";
  const titleChars = [...title].length;
  if (titleChars < 1 || titleChars > 100) throw new PlanError(400, "title must be 1-100 characters (contract rule T7)");
  if (!description.trim() || description.length > 5000) throw new PlanError(400, "description must be 1-5000 characters");
  const budget = nearToYocto(b.budget_near);
  if (budget < 10n ** 22n) throw new PlanError(400, "budget_near must be at least 0.01 NEAR");
  const deadlineHours = b.deadline_hours === undefined ? 3 : Number(b.deadline_hours);
  if (!Number.isFinite(deadlineHours) || deadlineHours <= 0 || deadlineHours > 24 * 30) {
    throw new PlanError(400, "deadline_hours must be > 0 and at most 720");
  }

  // Roles = capability tags held by at least one ACTIVE registered agent.
  const agents = (await getAllAgents()).filter((a) => a.active);
  const roleAgents = new Map<string, string[]>();
  for (const a of agents) for (const c of a.capabilities) roleAgents.set(c, [...(roleAgents.get(c) ?? []), a.name]);
  if (roleAgents.size === 0) throw new PlanError(409, "no active agents registered on the contract");

  const fee = budget / 10n; // 10% coordinator fee
  const pool = budget - fee;
  const available = [...roleAgents.entries()]
    .map(([role, names]) => {
      const descs = agents.filter((a) => a.capabilities.includes(role)).map((a) => `${a.name}: ${a.description}`);
      return `- ${role} — agents: ${descs.join(" | ")}`;
    })
    .join("\n");
  const user =
    `Task title: ${title}\n\nTask description:\n${description}\n\n` +
    `Budget: ${yoctoToNear(budget)} NEAR total (coordinator keeps 10%; ${yoctoToNear(pool)} NEAR goes to the slots).\n\n` +
    `Available roles:\n${available}`;

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    if (store.planSpent() + ATTEMPT_RESERVE_USD > config.planSpendLimitUsd) {
      throw new PlanError(429, `planning budget reached (~$${store.planSpent().toFixed(4)} of $${config.planSpendLimitUsd})`);
    }
    const raws: Record<string, string> = {};
    try {
      const c = await complete("plan", PROMPT, user, PLAN_MAX_TOKENS, raws);
      store.addPlanSpend(c.costUsd);
      console.log(`[plan] attempt ${attempt}: ${c.content.length} chars, finish=${c.finish}, usage=${JSON.stringify(c.usage)}, ~$${c.costUsd.toFixed(4)}`);
      if (c.finish !== "stop") throw new Error(`finish_reason=${c.finish}`);

      // ---- code validates + fixes ----
      const fixes: string[] = [];
      const jsonText = c.content.slice(c.content.indexOf("{"), c.content.lastIndexOf("}") + 1);
      let parsed: { slots?: unknown };
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error("answer is not valid JSON");
      }
      if (!Array.isArray(parsed.slots)) throw new Error('answer has no "slots" array');
      const proposed = parsed.slots as Record<string, unknown>[];
      const kept = proposed.filter((s) => {
        const ok = typeof s.role === "string" && roleAgents.has(s.role);
        if (!ok) fixes.push(`dropped slot with unavailable role ${JSON.stringify(s.role)}`);
        return ok;
      });
      if (kept.length > MAX_SLOTS) {
        fixes.push(`trimmed ${kept.length} slots to ${MAX_SLOTS}`);
        kept.length = MAX_SLOTS;
      }
      if (kept.length === 0) throw new Error("no slot uses an available role");
      const rewards = distribute(kept.map((s) => Number(s.reward_near)), pool, fixes);
      const proposedSum = kept.reduce((a, s) => a + (Number(s.reward_near) || 0), 0);
      fixes.push(
        `rewards scaled from proposed ${kept.map((s) => s.reward_near).join(" + ")} = ${proposedSum} NEAR ` +
          `to ${yoctoToNear(pool)} NEAR so that rewards + 10% fee = budget exactly`,
      );
      const slots: PlanSlot[] = kept.map((s, i) => {
        let brief = typeof s.brief === "string" ? s.brief.trim() : "";
        if (!brief) throw new Error(`slot ${i} (${s.role}) has no brief`);
        if (brief.length > MAX_BRIEF_CHARS) {
          fixes.push(`slot ${i} brief truncated to ${MAX_BRIEF_CHARS} chars`);
          brief = brief.slice(0, MAX_BRIEF_CHARS);
        }
        const reason = (typeof s.reason === "string" ? s.reason : "").replace(/\s+/g, " ").trim().slice(0, 200);
        return {
          role: s.role as string,
          reason,
          reward: rewards[i]!.toString(),
          reward_near: yoctoToNear(rewards[i]!),
          brief,
          agents: roleAgents.get(s.role as string)!,
        };
      });
      // Briefs must be self-contained: reject any that lean on another role's work.
      const xref = crossReferenceProblems(slots, [...roleAgents.keys()]);
      if (xref.length) throw new Error(`briefs not self-contained: ${xref.join("; ")}`);

      const total = slots.reduce((a, s) => a + BigInt(s.reward), 0n) + fee;
      if (total !== budget) throw new Error(`internal: rewards + fee = ${total} != budget ${budget}`);

      const proof = await signed(c, "provider_tee");
      const descriptionHash = sha256(description);
      const deadlineMs = Date.now() + deadlineHours * 3600_000;
      const plan: Plan = {
        title,
        description,
        description_hash: descriptionHash,
        budget: budget.toString(),
        coordinator_fee: fee.toString(),
        slots,
        fixes,
        create_task: {
          contract_id: config.contractId,
          method: "create_task",
          args: {
            title,
            description_hash: descriptionHash,
            slots: slots.map((s) => ({ role: s.role, reward: s.reward })),
            coordinator_fee: fee.toString(),
            deadline: (BigInt(deadlineMs) * 1_000_000n).toString(),
          },
          attached_deposit: (budget + STORAGE_ALLOWANCE).toString(),
          deadline_iso: new Date(deadlineMs).toISOString(),
        },
        proof,
        created_at: new Date().toISOString(),
      };
      store.savePlan(plan.description_hash, plan);
      console.log(
        `[plan] OK "${title}": ${slots.map((s) => `${s.role}=${s.reward_near}`).join(", ")}, fee=${yoctoToNear(fee)} NEAR, ` +
          `signed ${proof.kind} by ${proof.signing_address}; planning spend ~$${store.planSpent().toFixed(4)}`,
      );
      return plan;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[plan] attempt ${attempt}/${MAX_PLAN_ATTEMPTS} failed: ${lastError}`);
    }
  }
  throw new PlanError(502, `planning failed after ${MAX_PLAN_ATTEMPTS} attempts: ${lastError}`);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Briefs must be self-contained (agents run in parallel and can't see each other).
 * Returns problems for any brief that points at another role's output/sources/findings.
 */
export function crossReferenceProblems(slots: { role: string; brief: string }[], allRoles: string[]): string[] {
  const problems: string[] = [];
  const WORK = "(?:sources?|source list|findings?|outputs?|reports?|results?|data|adoption data|metrics|evidence|work|analysis)";
  const generic = [
    new RegExp(`\\b(?:other|another|each other'?s?|the other) (?:roles?|agents?)(?:['’]s?)?\\s+${WORK}\\b`, "i"),
    new RegExp(`\\b(?:other|another) (?:roles?|agents?)['’]s?\\b`, "i"),
  ];
  slots.forEach((s, i) => {
    const hits: string[] = [];
    for (const other of allRoles.filter((r) => r !== s.role)) {
      const o = escapeRe(other);
      const patterns = [
        new RegExp(`\\b${o}[- ](?:role|agent)['’]s\\b`, "i"), // "research agent's", "research role's"
        new RegExp(`(?<!\\bthe )\\b${o}['’]s\\s+${WORK}\\b`, "i"), // "research's findings" (not "the market's data")
        new RegExp(`\\bfrom (?:the )?${o}(?:[- ](?:role|agent))?(?=\\s*(?:$|[,.;:)])|\\s+${WORK}\\b)`, "i"), // "from research", "from the research role"
        new RegExp(`\\bfrom (?:the )?${o}[- ](?:role|agent)\\b`, "i"),
        new RegExp(`\\bthe ${o}(?:[- ](?:role|agent))?\\s+${WORK}\\b`, "i"), // "the research sources"
        new RegExp(`\\b${o}[- ](?:role|agent)\\s+${WORK}\\b`, "i"), // "research role findings"
      ];
      for (const p of patterns) {
        const m = p.exec(s.brief);
        if (m) hits.push(`"${m[0]}"`);
      }
    }
    for (const p of generic) {
      const m = p.exec(s.brief);
      if (m) hits.push(`"${m[0]}"`);
    }
    if (hits.length) problems.push(`slot ${i} (${s.role}) brief refers to another role's work: ${[...new Set(hits)].join(", ")}`);
  });
  return problems;
}

/** The plan matches a task if its on-chain slots have the same roles and rewards, in order. */
export function planMatches(plan: Plan, slots: { role: string; reward: string }[]): boolean {
  return (
    plan.slots.length === slots.length && plan.slots.every((s, i) => s.role === slots[i]!.role && s.reward === slots[i]!.reward)
  );
}
