// Live Execution: pure derivations from real data only (contract task + optional coordinator view).
// Nothing here guesses activity: a lane is "assigned" until the contract shows a result_hash.
import { JOURNEY } from "./journey";
import type { Agent, Task } from "./near";

/** On-chain proof_ref: "nearai:<kind>:<model>:<chat_id>:<signing_address>" (model may contain "/"). */
export interface ProofRef {
  provider: string;
  kind: string;
  model: string;
  chatId: string;
  signer: string;
}
export function parseProofRef(ref: string | null): ProofRef | null {
  if (!ref) return null;
  const parts = ref.split(":");
  if (parts.length < 5) return null;
  const signer = parts.at(-1)!;
  const chatId = parts.at(-2)!;
  const [provider, kind, ...model] = parts.slice(0, -2);
  if (!provider || !kind || model.length === 0) return null;
  return { provider, kind, model: model.join(":"), chatId, signer };
}

export const REVIEW_PERIOD_MS = 24 * 60 * 60 * 1000;
export const nsToMs = (ns: string) => Number(BigInt(ns) / 1_000_000n);

// ---- Coordinator view of a task (subset of GET /tasks/:id) ------------------
export interface CoordProofPart {
  kind: string;
  model: string;
  chat_id: string;
  signing_address: string;
}
export interface CoordSlot {
  result: string | null;
  proof: { gather?: CoordProofPart | null; write?: CoordProofPart } | { kind: string } | null;
}
export interface CoordTask {
  description: string | null;
  slots: CoordSlot[];
  final_report: {
    status: string;
    attempts: number;
    report_hash: string | null;
    matches_on_chain: boolean;
    tx: string | null;
    synthesis_proof: CoordProofPart | null;
    last_error: string | null;
  } | null;
}

// ---- Pipeline -----------------------------------------------------------------
export type StageState = "done" | "current" | "waiting" | "stopped" | "unknown";
export interface Stage {
  key: string;
  label: string;
  state: StageState;
  detail: string;
}

/** The 8 journey steps (lib/journey.ts) for one task, each with its state from on-chain data
 *  (plus the coordinator's stored reports when it is reachable). */
export function pipeline(t: Task, coord: CoordTask | null, coordOnline: boolean, now: number): Stage[] {
  const n = t.slots.length;
  const assigned = t.slots.filter((s) => s.agent_id).length;
  const submitted = t.slots.filter((s) => s.result_hash).length;
  const stored = coord ? coord.slots.filter((s, i) => t.slots[i]?.result_hash && s.result).length : null;
  const ended = t.status === "Cancelled" || t.status === "Expired";
  const pastDeadline = now >= nsToMs(t.deadline);
  const stopped = (s: StageState): StageState => (ended ? "stopped" : s);
  const L = Object.fromEntries(JOURNEY.map((j) => [j.key, j.label])) as Record<string, string>;
  const working = assigned - submitted;

  return [
    { key: "created", label: L.created!, state: "done", detail: `${n} role${n === 1 ? "" : "s"} planned` },
    {
      key: "funded",
      label: L.funded!,
      state: "done",
      detail: t.status === "Settled" ? "Escrow paid out" : ended ? "Escrow returned or paid" : "Budget held by the contract",
    },
    {
      key: "assigned",
      label: L.assigned!,
      state: assigned === n ? "done" : stopped(t.status === "Funded" || t.status === "InProgress" ? "current" : "waiting"),
      detail: `${assigned}/${n} slots assigned on chain`,
    },
    {
      key: "executing",
      label: L.executing!,
      state: submitted === n ? "done" : assigned === 0 ? stopped("waiting") : pastDeadline ? "stopped" : stopped("current"),
      detail: submitted === n ? "Every agent finished" : pastDeadline && submitted < n ? `Deadline passed, ${submitted}/${n} finished` : working > 0 ? `${working} agent${working === 1 ? "" : "s"} working` : "Waiting for agents",
    },
    {
      key: "submitted",
      label: L.submitted!,
      state:
        submitted === n && (stored === null || stored === n)
          ? stored === null ? "unknown" : "done"
          : submitted > 0 ? stopped("current") : stopped("waiting"),
      detail:
        stored === null
          ? `${submitted}/${n} signed on chain${submitted && !coordOnline ? ", reports offline" : ""}`
          : `${submitted}/${n} signed on chain, ${stored} report${stored === 1 ? "" : "s"} stored`,
    },
    {
      key: "aggregated",
      label: L.aggregated!,
      state: t.final_report_hash ? "done" : t.status === "Submitted" ? "current" : stopped("waiting"),
      detail: t.final_report_hash
        ? "Final report hash on chain"
        : t.status === "Submitted"
          ? coord?.final_report?.last_error
            ? `Synthesis retrying: ${coord.final_report.last_error}`
            : "Coordinator writing the signed synthesis"
          : "After all submissions",
    },
    {
      key: "approved",
      label: L.approved!,
      state: t.status === "Settled" ? "done" : t.status === "Submitted" && t.final_report_hash ? "current" : stopped("waiting"),
      detail: t.status === "Settled" ? "Approved or released" : t.status === "Submitted" && t.final_report_hash ? "Waiting for the creator" : "After the final report",
    },
    {
      key: "settled",
      label: L.settled!,
      state: t.status === "Settled" ? "done" : ended ? "stopped" : "waiting",
      detail: t.status === "Settled" ? "Each owner and the coordinator paid" : t.status === "Expired" ? "Expired: submitted slots paid, rest refunded" : t.status === "Cancelled" ? "Cancelled: escrow refunded" : "Pays each owner and the coordinator",
    },
  ];
}

// ---- Agent lanes ------------------------------------------------------------------
export type LaneState = "unassigned" | "assigned" | "submitted" | "verified" | "paid" | "unpaid";
export function laneState(t: Task, i: number, coord: CoordTask | null): LaneState {
  const s = t.slots[i]!;
  if (!s.agent_id) return "unassigned";
  if (!s.result_hash) return t.status === "Expired" || t.status === "Cancelled" ? "unpaid" : "assigned";
  if (t.status === "Settled" || t.status === "Expired") return "paid";
  return coord?.slots[i]?.result ? "verified" : "submitted";
}
export const LANE_LABEL: Record<LaneState, string> = {
  unassigned: "Not assigned",
  assigned: "Assigned. Waiting for the agent's signed submission",
  submitted: "Submitted on chain",
  verified: "Submitted. Report stored and checked by the coordinator",
  paid: "Paid",
  unpaid: "Not submitted. Not paid",
};

// ---- Payouts (contract rules) -------------------------------------------------------
export interface Payout {
  to: string;
  amount: bigint;
  label: string;
  role: string | null;
}
export function taskPayouts(t: Task, agents: Map<string, Agent>, coordinator: string): Payout[] {
  const paidSlots = t.slots.filter((s) => s.result_hash && s.agent_id);
  const slotPay = (): Payout[] =>
    paidSlots.map((s) => {
      const a = agents.get(s.agent_id!);
      return { to: a?.owner ?? s.agent_id!, amount: BigInt(s.reward), label: a ? `${a.name}, owner` : "agent owner", role: s.role };
    });
  if (t.status === "Settled") return [...slotPay(), { to: coordinator, amount: BigInt(t.coordinator_fee), label: "Coordinator fee", role: null }];
  if (t.status === "Expired") {
    const paid = slotPay();
    const refund = BigInt(t.escrow) - paid.reduce((s, p) => s + p.amount, 0n);
    return [...paid, ...(refund > 0n ? [{ to: t.creator, amount: refund, label: "Refund to creator", role: null }] : [])];
  }
  if (t.status === "Cancelled") return [{ to: t.creator, amount: BigInt(t.escrow), label: "Refund to creator", role: null }];
  return [];
}

// ---- Which actions are valid right now (mirrors the contract's require! checks) -------
export function validActions(t: Task, account: string | null, now: number) {
  const isCreator = !!account && account === t.creator;
  const releaseAt = t.submitted_at ? nsToMs(t.submitted_at) + REVIEW_PERIOD_MS : null;
  return {
    isCreator,
    approve: isCreator && t.status === "Submitted" && !!t.final_report_hash,
    approveWaiting: t.status === "Submitted" && !t.final_report_hash,
    release: !!account && t.status === "Submitted" && releaseAt !== null && now >= releaseAt,
    releaseAt,
    expire: isCreator && (t.status === "Funded" || t.status === "InProgress") && now >= nsToMs(t.deadline),
    cancel: isCreator && t.status === "Funded",
  };
}
