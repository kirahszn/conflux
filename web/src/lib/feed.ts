// Turns raw contract records into activity events. Everything here is derived
// from real on-chain data (plus optional coordinator extras); nothing is invented.
import { CONTRACT_ID, explorer, formatNear, nsToDate, taskBudget, type Agent, type Task, type TaskStatus } from "./near";

// ---- Activity events -------------------------------------------------------
export interface ActivityEvent {
  key: string;
  kind: "created" | "submitted" | "settled" | "paid" | "expired" | "cancelled";
  text: string;
  role?: string;
  /** Exact time when the contract records it; null when only the order is known. */
  at: Date | null;
  sortKey: bigint; // ns
  href: string;
  taskId: number;
  /** slot index for submissions and slot payouts */
  slot?: number;
}

export function activity(agents: Agent[], tasks: Task[], coordinator: string): ActivityEvent[] {
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  const ev: ActivityEvent[] = [];
  for (const t of tasks) {
    const created = BigInt(t.created_at);
    ev.push({
      key: `c:${t.id}`,
      taskId: t.id,
      kind: "created",
      text: `Task #${t.id} created: ${t.title}. ${formatNear(taskBudget(t))} NEAR in escrow`,
      at: nsToDate(t.created_at),
      sortKey: created,
      href: explorer.account(t.creator),
    });
    let last = created;
    t.slots.forEach((s, i) => {
      if (!s.submitted_at || !s.agent_id) return;
      const at = BigInt(s.submitted_at);
      if (at > last) last = at;
      ev.push({
        key: `s:${t.id}:${i}`,
        taskId: t.id,
        slot: i,
        kind: "submitted",
        role: s.role,
        text: `${byId.get(s.agent_id)?.name ?? s.agent_id} submitted to task #${t.id}`,
        at: nsToDate(s.submitted_at),
        sortKey: at,
        href: explorer.account(s.agent_id),
      });
    });
    if (t.submitted_at && BigInt(t.submitted_at) > last) last = BigInt(t.submitted_at);

    // Settlement / expiry time is not stored by the contract, only that it happened after the last submission.
    const paid = (i: number, sKey: bigint) => {
      const s = t.slots[i]!;
      const owner = s.agent_id ? (byId.get(s.agent_id)?.owner ?? s.agent_id) : null;
      if (!owner) return;
      ev.push({
        key: `p:${t.id}:${i}`,
        taskId: t.id,
        slot: i,
        kind: "paid",
        role: s.role,
        text: `+${formatNear(s.reward)} NEAR paid to ${owner}`,
        at: null,
        sortKey: sKey,
        href: explorer.account(owner),
      });
    };
    if (t.status === "Settled") {
      ev.push({ key: `x:${t.id}`, taskId: t.id, kind: "settled", text: `Task #${t.id} settled`, at: null, sortKey: last + 3n, href: explorer.account(CONTRACT_ID) });
      t.slots.forEach((_, i) => paid(i, last + 2n));
      ev.push({
        key: `pc:${t.id}`,
        taskId: t.id,
        kind: "paid",
        text: `+${formatNear(t.coordinator_fee)} NEAR fee paid to ${coordinator}`,
        at: null,
        sortKey: last + 1n,
        href: explorer.account(coordinator),
      });
    } else if (t.status === "Expired") {
      const after = BigInt(t.deadline) > last ? BigInt(t.deadline) : last;
      ev.push({ key: `x:${t.id}`, taskId: t.id, kind: "expired", text: `Task #${t.id} expired, unused escrow refunded`, at: null, sortKey: after + 2n, href: explorer.account(t.creator) });
      t.slots.forEach((s, i) => s.result_hash && paid(i, after + 1n));
    } else if (t.status === "Cancelled") {
      ev.push({ key: `x:${t.id}`, taskId: t.id, kind: "cancelled", text: `Task #${t.id} cancelled, escrow refunded`, at: null, sortKey: last + 1n, href: explorer.account(t.creator) });
    }
  }
  return ev.sort((a, b) => (b.sortKey > a.sortKey ? 1 : b.sortKey < a.sortKey ? -1 : 0));
}

export function timeAgo(d: Date, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
