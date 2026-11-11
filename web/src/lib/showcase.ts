// "From task #3" landing sections: one object built from real data only.
// Sources: the coordinator API (task, slot proofs, linked plan, final report) and the contract
// (agent names and owners, coordinator account). Pure code, no React and no runtime imports,
// so scripts/snapshot-task3.ts can reuse it to write src/data/task3.json.

export interface Showcase {
  source: "live" | "snapshot";
  captured_at: string; // ISO time the data was read
  contract_id: string;
  coordinator: string;
  task: { id: number; title: string; creator: string; status: string; budget_near: string; fee_near: string; final_report_hash: string | null; final_report_tx: string | null };
  plan: { slots: { role: string; reason: string; reward_near: string }[]; proof: ProofSummary };
  contributions: {
    slot: number;
    role: string;
    reward_near: string;
    agent_id: string;
    name: string;
    owner: string;
    result_hash: string | null;
    proof: (ProofSummary & { gather_kind: string | null }) | null;
  }[];
  synthesis: { proof: ProofSummary | null; disagreement_count: number; disagreements: Disagreement[] };
  payouts: { to: string; amount_near: string; role: string | null; label: string }[];
}
export interface ProofSummary {
  kind: string;
  model: string;
  chat_id: string;
  signing_address: string;
}
export interface Disagreement {
  topic: string;
  claims: { agent: string; text: string }[];
}

// ---- Inputs (shapes of the coordinator responses we use) ---------------------
export interface CoordTaskInput {
  id: number;
  title: string;
  creator: string;
  status: string;
  coordinator_fee: string;
  final_report_hash: string | null;
  slots: {
    role: string;
    reward: string;
    agent_id: string | null;
    result_hash: string | null;
    proof: { gather?: { kind?: string } | null; write?: Partial<ProofSummary> } | null;
  }[];
  final_report: { tx: string | null; synthesis_proof: Partial<ProofSummary> | null } | null;
}
export interface CoordPlanInput {
  slots: { role: string; reason: string; reward_near: string }[];
  proof: Partial<ProofSummary>;
}
export interface AgentInput {
  agent_id: string;
  name: string;
  owner: string;
}

const YOCTO = 10n ** 24n;
export function nearStr(yocto: string | bigint, maxDecimals = 4): string {
  const y = BigInt(yocto);
  const frac = (y % YOCTO).toString().padStart(24, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return `${y / YOCTO}${frac ? `.${frac}` : ""}`;
}

function proofSummary(p: Partial<ProofSummary> | null | undefined): ProofSummary | null {
  if (!p?.kind || !p.model || !p.chat_id || !p.signing_address) return null;
  return { kind: p.kind, model: p.model, chat_id: p.chat_id, signing_address: p.signing_address };
}

/** Bullets under "Where the Agents Disagree" in the final report. */
export function disagreeBullets(report: string): string[] {
  const lines = report.split("\n");
  const start = lines.findIndex((l) => /^#{2,6}\s+Where the Agents Disagree\s*$/.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l)) break;
    if (/^\s*[-*]\s+/.test(l)) out.push(l.replace(/^\s*[-*]\s+/, "").trim());
  }
  return out;
}

const plain = (s: string) => s.replace(/\*\*|`/g, "").replace(/\s*[—–]\s*/g, ", ").trim();

/**
 * A bullet like "**Topic:** Research Agent cites X; Market Analysis Agent cites Y." becomes
 * { topic, claims: [{agent, text: "cites X"}, ...] }. Only kept if every part is attributed to a
 * known agent and contains a figure, so each side is a real number from that agent.
 */
export function structureDisagreement(bullet: string, agentNames: string[]): Disagreement | null {
  const m = /^\*\*(.+?):?\*\*:?\s*(.*)$/.exec(bullet);
  if (!m) return null;
  const topic = plain(m[1]!).replace(/:$/, "");
  const parts = m[2]!.replace(/\.$/, "").split(/;\s+/);
  const names = [...agentNames].sort((a, b) => b.length - a.length);
  const claims: Disagreement["claims"] = [];
  for (const part of parts) {
    const agent = names.find((n) => part.startsWith(n));
    if (!agent || !/\d/.test(part)) return null;
    claims.push({ agent, text: plain(part.slice(agent.length)) });
  }
  return claims.length >= 2 && new Set(claims.map((c) => c.agent)).size >= 2 ? { topic, claims } : null;
}

export function buildShowcase(input: {
  source: Showcase["source"];
  contractId: string;
  coordinator: string;
  task: CoordTaskInput;
  plan: CoordPlanInput;
  report: string;
  agents: AgentInput[];
  capturedAt?: Date;
}): Showcase {
  const { task, plan, agents } = input;
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  const budget = task.slots.reduce((s, x) => s + BigInt(x.reward), BigInt(task.coordinator_fee));

  const contributions = task.slots.flatMap((s, slot) => {
    const a = s.agent_id ? byId.get(s.agent_id) : undefined;
    if (!a) return [];
    const w = proofSummary(s.proof?.write);
    return [
      {
        slot,
        role: s.role,
        reward_near: nearStr(s.reward),
        agent_id: a.agent_id,
        name: a.name,
        owner: a.owner,
        result_hash: s.result_hash,
        proof: w ? { ...w, gather_kind: s.proof?.gather?.kind ?? null } : null,
      },
    ];
  });

  const bullets = disagreeBullets(input.report);
  const names = agents.map((a) => a.name);
  const disagreements = bullets.map((b) => structureDisagreement(b, names)).filter((d): d is Disagreement => d !== null).slice(0, 3);

  const payouts: Showcase["payouts"] =
    task.status === "Settled"
      ? [
          ...contributions.map((c) => ({ to: c.owner, amount_near: c.reward_near, role: c.role, label: c.name })),
          { to: input.coordinator, amount_near: nearStr(task.coordinator_fee), role: null, label: "Coordinator fee" },
        ]
      : [];

  const planProof = proofSummary(plan.proof);
  if (!planProof) throw new Error("plan has no complete proof");
  return {
    source: input.source,
    captured_at: (input.capturedAt ?? new Date()).toISOString(),
    contract_id: input.contractId,
    coordinator: input.coordinator,
    task: {
      id: task.id,
      title: task.title,
      creator: task.creator,
      status: task.status,
      budget_near: nearStr(budget),
      fee_near: nearStr(task.coordinator_fee),
      final_report_hash: task.final_report_hash,
      final_report_tx: task.final_report?.tx ?? null,
    },
    plan: { slots: plan.slots.map((s) => ({ role: s.role, reason: s.reason, reward_near: s.reward_near })), proof: planProof },
    contributions,
    synthesis: { proof: proofSummary(task.final_report?.synthesis_proof), disagreement_count: bullets.length, disagreements },
    payouts,
  };
}
