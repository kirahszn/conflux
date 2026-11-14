// Network graph model, built only from contract data. An edge exists only for a real relationship:
//   owner -> agent      the contract records this owner for the agent (it receives the rewards)
//   agent -> task       the coordinator assigned this agent to a slot of the task (on chain)
//   creator -> task     this account created and funded the task          (task view only)
//   coordinator -> task assigns slots, writes the final report, earns the fee (task view only)
// Nothing is inferred or decorative. Layout is deterministic columns, so it never jitters.
import { formatNear, payouts, type Agent, type Task } from "./near";

export type NodeKind = "owner" | "agent" | "task" | "creator" | "coordinator";
export type EdgeState = "assigned" | "submitted" | "paid" | "unpaid" | "owns" | "funds" | "coordinates";

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub: string;
  role: string | null;
  x: number;
  y: number;
  dim?: boolean;
}
export interface GEdge {
  id: string;
  from: string;
  to: string;
  state: EdgeState;
  role: string | null;
  label?: string;
}
export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
}

export const NODE_W = 236;
export const NODE_H = 54;
const GAP = 14;
const PAD = 24;

function slotEdgeState(t: Task, i: number): EdgeState {
  const s = t.slots[i]!;
  if (!s.result_hash) return t.status === "Expired" || t.status === "Cancelled" ? "unpaid" : "assigned";
  return t.status === "Settled" || t.status === "Expired" ? "paid" : "submitted";
}

function columns(cols: GNode[][], width: number): Graph["nodes"] {
  const height = Math.max(...cols.map((c) => c.length), 1) * (NODE_H + GAP) - GAP + PAD * 2;
  const xs = cols.length === 1 ? [width / 2 - NODE_W / 2] : cols.map((_, i) => PAD + (i * (width - NODE_W - PAD * 2)) / (cols.length - 1));
  return cols.flatMap((col, ci) => {
    const colH = col.length * (NODE_H + GAP) - GAP;
    const top = (height - colH) / 2;
    return col.map((n, ri) => ({ ...n, x: xs[ci]!, y: top + ri * (NODE_H + GAP) }));
  });
}
const heightOf = (nodes: GNode[]) => Math.max(...nodes.map((n) => n.y + NODE_H), 0) + PAD;

const short = (s: string, n = 25) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Whole network: owners | agents | tasks. Tasks newest first. Agents with no task still appear. */
export function networkGraph(agents: Agent[], tasks: Task[]): Graph {
  const width = 1000;
  const owners = [...new Set(agents.map((a) => a.owner))];
  const earned = payouts(tasks).byAgent;
  const ownerNodes: GNode[] = owners.map((o) => {
    const mine = agents.filter((a) => a.owner === o);
    const total = mine.reduce((s, a) => s + (earned.get(a.agent_id) ?? 0n), 0n);
    return { id: `owner:${o}`, kind: "owner", label: short(o), sub: `${mine.length} agent${mine.length === 1 ? "" : "s"}, ${formatNear(total)} NEAR earned`, role: null, x: 0, y: 0 };
  });
  const agentNodes: GNode[] = agents.map((a) => ({
    id: `agent:${a.agent_id}`,
    kind: "agent",
    label: short(a.name),
    sub: `${a.capabilities.join(", ")}${a.active ? "" : ", inactive"}`,
    role: a.capabilities[0] ?? null,
    x: 0,
    y: 0,
    dim: !a.active,
  }));
  const shown = [...tasks].filter((t) => t.slots.some((s) => s.agent_id)).sort((a, b) => b.id - a.id);
  const taskNodes: GNode[] = shown.map((t) => ({ id: `task:${t.id}`, kind: "task", label: short(`#${t.id} ${t.title}`), sub: `${t.status}, ${formatNear(t.escrow)} NEAR`, role: null, x: 0, y: 0 }));
  const nodes = columns([ownerNodes, agentNodes, taskNodes], width);
  const edges: GEdge[] = [
    ...agents.map((a) => ({ id: `o:${a.agent_id}`, from: `owner:${a.owner}`, to: `agent:${a.agent_id}`, state: "owns" as const, role: a.capabilities[0] ?? null })),
    ...shown.flatMap((t) =>
      t.slots.flatMap((s, i) =>
        s.agent_id ? [{ id: `s:${t.id}:${i}`, from: `agent:${s.agent_id}`, to: `task:${t.id}`, state: slotEdgeState(t, i), role: s.role, label: `${s.role}, ${formatNear(s.reward)} NEAR` }] : [],
      ),
    ),
  ];
  return { nodes, edges, width, height: heightOf(nodes) };
}

/** One task: owners | agents (one per slot) | task | creator and coordinator. */
export function taskGraph(task: Task, agents: Agent[], coordinator: string): Graph {
  const width = 1180;
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  const slotAgents = [...new Set(task.slots.map((s) => s.agent_id).filter((x): x is string => !!x))];
  const owners = [...new Set(slotAgents.map((id) => byId.get(id)?.owner).filter((x): x is string => !!x))];
  const ownerNodes: GNode[] = owners.map((o) => ({ id: `owner:${o}`, kind: "owner", label: short(o), sub: "owner, receives rewards", role: null, x: 0, y: 0 }));
  const agentNodes: GNode[] = task.slots.map((s, i) => {
    const a = s.agent_id ? byId.get(s.agent_id) : undefined;
    return s.agent_id
      ? { id: `agent:${s.agent_id}:${i}`, kind: "agent", label: short(a?.name ?? s.agent_id), sub: `${s.role} slot`, role: s.role, x: 0, y: 0 }
      : { id: `open:${i}`, kind: "agent", label: "Not assigned yet", sub: `${s.role} slot`, role: s.role, x: 0, y: 0, dim: true };
  });
  const taskNode: GNode = { id: `task:${task.id}`, kind: "task", label: short(`#${task.id} ${task.title}`), sub: `${task.status}, ${formatNear(task.escrow)} NEAR escrow`, role: null, x: 0, y: 0 };
  const rightNodes: GNode[] = [
    { id: `creator:${task.creator}`, kind: "creator", label: short(task.creator), sub: "creator, funded the task", role: null, x: 0, y: 0 },
    { id: `coordinator:${coordinator}`, kind: "coordinator", label: short(coordinator), sub: `coordinator, ${formatNear(task.coordinator_fee)} NEAR fee`, role: null, x: 0, y: 0 },
  ];
  const nodes = columns([ownerNodes, agentNodes, [taskNode], rightNodes], width);
  const edges: GEdge[] = [
    ...task.slots.flatMap((s, i) => {
      const a = s.agent_id ? byId.get(s.agent_id) : undefined;
      const out: GEdge[] = [];
      if (s.agent_id && a) out.push({ id: `o:${i}`, from: `owner:${a.owner}`, to: `agent:${s.agent_id}:${i}`, state: "owns", role: s.role });
      if (s.agent_id) out.push({ id: `s:${i}`, from: `agent:${s.agent_id}:${i}`, to: taskNode.id, state: slotEdgeState(task, i), role: s.role, label: `${formatNear(s.reward)} NEAR` });
      return out;
    }),
    { id: "creator", from: taskNode.id, to: `creator:${task.creator}`, state: "funds", role: null },
    { id: "coord", from: taskNode.id, to: `coordinator:${coordinator}`, state: "coordinates", role: null },
  ];
  return { nodes, edges, width, height: heightOf(nodes) };
}

export const EDGE_LABEL: Record<EdgeState, string> = {
  owns: "owns the agent, receives its rewards",
  assigned: "assigned, working",
  submitted: "submitted on chain",
  paid: "submitted and paid",
  unpaid: "did not submit, not paid",
  funds: "created and funded",
  coordinates: "assigns slots, writes the final report",
};
