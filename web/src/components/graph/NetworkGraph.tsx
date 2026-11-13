"use client";
// Interactive network graph (plain SVG). Every node and line comes from lib/graph.ts, which only
// draws relationships the contract records. Hover highlights a node's neighbours; click or Enter
// opens its profile. Read-only mode (landing page) has hover but no panel. Phones get a list.
import Link from "next/link";
import { useMemo, useState } from "react";
import { explorer } from "@/config/network";
import { EDGE_LABEL, NODE_H, NODE_W, type EdgeState, type GEdge, type GNode, type Graph } from "@/lib/graph";
import { formatNear, nsToDate, payouts, type Agent, type Task } from "@/lib/near";
import { roleColor } from "@/lib/roles";
import { useSlotVerifications } from "@/lib/useSlotVerifications";
import { shortenAccount } from "../Account";
import { RoleTag, StatusPill } from "../Tags";
import { VerifyBadge } from "../VerifyBadge";

const EDGE_STYLE: Record<EdgeState, { dash?: string; width: number; opacity: number }> = {
  owns: { dash: "2 4", width: 1.2, opacity: 0.55 },
  assigned: { dash: "6 5", width: 1.6, opacity: 0.9 },
  submitted: { width: 2, opacity: 0.95 },
  paid: { width: 2.4, opacity: 1 },
  unpaid: { dash: "1 5", width: 1.4, opacity: 0.6 },
  funds: { width: 1.4, opacity: 0.6 },
  coordinates: { dash: "4 4", width: 1.4, opacity: 0.6 },
};
const KIND_LABEL: Record<GNode["kind"], string> = { owner: "Owner", agent: "Agent", task: "Task", creator: "Creator", coordinator: "Coordinator" };

export function NetworkGraph({
  graph,
  agents,
  tasks,
  readOnly = false,
  label,
}: {
  graph: Graph;
  agents: Agent[];
  tasks: Task[];
  readOnly?: boolean;
  label: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const focus = hover ?? selected;
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const near = useMemo(() => {
    if (!focus) return null;
    const ids = new Set([focus]);
    for (const e of graph.edges) if (e.from === focus || e.to === focus) ids.add(e.from).add(e.to);
    return ids;
  }, [focus, graph]);

  const usedStates = [...new Set(graph.edges.map((e) => e.state))];
  const sel = selected ? byId.get(selected) : undefined;

  return (
    <div className={readOnly ? "" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"}>
      <div className="min-w-0">
        <div className="hidden rounded-xl border border-line bg-bg sm:block">
          <svg viewBox={`0 0 ${graph.width} ${graph.height}`} className="block h-auto w-full" role="group" aria-label={label}>
            {graph.edges.map((e) => (
              <EdgePath key={e.id} e={e} from={byId.get(e.from)} to={byId.get(e.to)} faded={!!near && !(near.has(e.from) && near.has(e.to))} />
            ))}
            {graph.nodes.map((n) => (
              <NodeBox
                key={n.id}
                n={n}
                active={selected === n.id}
                faded={!!near && !near.has(n.id)}
                onEnter={() => setHover(n.id)}
                onLeave={() => setHover(null)}
                onPick={readOnly ? undefined : () => setSelected((s) => (s === n.id ? null : n.id))}
              />
            ))}
          </svg>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
          {usedStates.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <svg width="26" height="8" aria-hidden>
                <line x1="1" y1="4" x2="25" y2="4" stroke="currentColor" strokeWidth={EDGE_STYLE[s].width} strokeDasharray={EDGE_STYLE[s].dash} />
              </svg>
              {EDGE_LABEL[s]}
            </li>
          ))}
          {!readOnly && <li className="text-faint">Select a node to inspect it.</li>}
        </ul>
        <PhoneList graph={graph} byId={byId} onPick={readOnly ? undefined : setSelected} selected={selected} />
      </div>
      {!readOnly && (
        <aside className="min-w-0 rounded-xl border border-line bg-surface p-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto" aria-live="polite">
          {sel ? <Panel n={sel} agents={agents} tasks={tasks} onClose={() => setSelected(null)} /> : <p className="text-sm text-muted">Select an owner, agent or task to see its profile and activity.</p>}
        </aside>
      )}
    </div>
  );
}

function EdgePath({ e, from, to, faded }: { e: GEdge; from?: GNode; to?: GNode; faded: boolean }) {
  if (!from || !to) return null;
  const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2, x2 = to.x, y2 = to.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  const st = EDGE_STYLE[e.state];
  const color = e.role && (e.state === "submitted" || e.state === "paid" || e.state === "assigned") ? roleColor(e.role).solid : "#5d6a64";
  return (
    <path
      d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={st.width}
      strokeDasharray={st.dash}
      opacity={faded ? 0.08 : st.opacity}
      style={{ transition: "opacity 150ms" }}
    >
      <title>{`${EDGE_LABEL[e.state]}${e.label ? `: ${e.label}` : ""}`}</title>
    </path>
  );
}

function NodeBox({ n, active, faded, onEnter, onLeave, onPick }: { n: GNode; active: boolean; faded: boolean; onEnter: () => void; onLeave: () => void; onPick?: () => void }) {
  const accent = n.kind === "agent" ? roleColor(n.role).solid : n.kind === "task" ? "#00ec97" : n.kind === "coordinator" ? "#a98bff" : n.kind === "creator" ? "#7aa2ff" : "#8a948f";
  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      opacity={faded ? 0.25 : n.dim ? 0.6 : 1}
      style={{ transition: "opacity 150ms", cursor: onPick ? "pointer" : "default" }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onPick}
      onKeyDown={(ev) => {
        if (onPick && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          onPick();
        }
      }}
      tabIndex={onPick ? 0 : undefined}
      role={onPick ? "button" : undefined}
      aria-pressed={onPick ? active : undefined}
      aria-label={`${KIND_LABEL[n.kind]}: ${n.label}. ${n.sub}`}
      className="outline-none [&:focus-visible>rect:first-child]:stroke-green"
    >
      <rect width={NODE_W} height={NODE_H} rx="7" fill={active ? "#18201c" : "#111413"} stroke={active ? "#00ec97" : "#2c3430"} strokeWidth={active ? 1.6 : 1} />
      <rect x="0" y="8" width="3" height={NODE_H - 16} rx="1.5" fill={accent} />
      <text x="14" y="22" fill="#edf3f0" fontSize="15" fontWeight="600">{n.label}</text>
      <text x="14" y="41" fill="#9ca8a2" fontSize="12.5">{n.sub.length > 30 ? `${n.sub.slice(0, 29)}…` : n.sub}</text>
    </g>
  );
}

/** Phones: the same relationships as a list (no tiny SVG text). */
function PhoneList({ graph, byId, onPick, selected }: { graph: Graph; byId: Map<string, GNode>; onPick?: (id: string) => void; selected: string | null }) {
  const agentsAndTasks = graph.nodes.filter((n) => n.kind === "agent" || n.kind === "task");
  return (
    <ul className="divide-y divide-line rounded-xl border border-line sm:hidden">
      {agentsAndTasks.map((n) => {
        const links = graph.edges.filter((e) => (e.from === n.id || e.to === n.id) && e.state !== "owns" && e.state !== "funds" && e.state !== "coordinates");
        const body = (
          <>
            <span className="block font-medium text-fg">{n.label}</span>
            <span className="block text-xs text-muted">{n.sub}</span>
            {links.length > 0 && (
              <span className="mt-1 block text-[11px] text-faint">
                {links.map((e) => `${byId.get(e.from === n.id ? e.to : e.from)?.label ?? ""} (${EDGE_LABEL[e.state]})`).join("; ")}
              </span>
            )}
          </>
        );
        return (
          <li key={n.id}>
            {onPick ? (
              <button type="button" onClick={() => onPick(n.id)} aria-pressed={selected === n.id} className={`block min-h-11 w-full px-4 py-2.5 text-left ${selected === n.id ? "bg-surface-2" : ""}`}>
                {body}
              </button>
            ) : (
              <div className="px-4 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---- Detail panel ------------------------------------------------------------
function Panel({ n, agents, tasks, onClose }: { n: GNode; agents: Agent[]; tasks: Task[]; onClose: () => void }) {
  const [, rawId] = n.id.split(/:(.*)/s) as [string, string];
  const head = (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{KIND_LABEL[n.kind]}</p>
        <h3 className="mt-0.5 break-words text-base font-semibold text-fg">{n.label}</h3>
      </div>
      <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close profile">
        ✕
      </button>
    </div>
  );
  if (n.kind === "agent" && !n.id.startsWith("open:")) {
    const agentId = rawId.replace(/:\d+$/, "");
    const a = agents.find((x) => x.agent_id === agentId);
    return <>{head}{a ? <AgentProfile a={a} tasks={tasks} /> : <p className="text-sm text-muted">{agentId} is not registered on this contract.</p>}</>;
  }
  if (n.kind === "task") {
    const t = tasks.find((x) => x.id === Number(rawId));
    return <>{head}{t && <TaskProfile t={t} agents={agents} />}</>;
  }
  if (n.kind === "owner") {
    const mine = agents.filter((a) => a.owner === rawId);
    const earned = payouts(tasks).byAgent;
    return (
      <>
        {head}
        <Fact k="Account" v={<Ext id={rawId} />} />
        <Fact k="Earned" v={`${formatNear(mine.reduce((s, a) => s + (earned.get(a.agent_id) ?? 0n), 0n))} NEAR`} />
        <p className="mt-3 text-xs font-semibold text-fg-2">Agents owned</p>
        <ul className="mt-1 space-y-1 text-sm text-fg-2">{mine.map((a) => <li key={a.agent_id}>{a.name} <span className="text-xs text-faint">({a.completed_contributions} contributions)</span></li>)}</ul>
      </>
    );
  }
  if (n.kind === "coordinator" || n.kind === "creator") {
    return (
      <>
        {head}
        <Fact k="Account" v={<Ext id={rawId} />} />
        <p className="mt-3 text-sm text-muted">
          {n.kind === "coordinator"
            ? `Plans roles, assigns each slot to a registered agent, writes the signed synthesis and puts the final report hash on chain. Earns the task's coordinator fee when it settles.`
            : "Created the task, locked its budget in the contract, and approves the result."}
        </p>
      </>
    );
  }
  return <>{head}<p className="text-sm text-muted">This slot has no agent assigned yet.</p></>;
}

function AgentProfile({ a, tasks }: { a: Agent; tasks: Task[] }) {
  const slots = tasks.flatMap((t) => t.slots.map((s, i) => ({ t, s, i })).filter((x) => x.s.agent_id === a.agent_id)).sort((x, y) => y.t.id - x.t.id);
  const verification = useSlotVerifications(tasks.filter((t) => slots.some((x) => x.t.id === t.id)));
  const earned = payouts(tasks).byAgent.get(a.agent_id) ?? 0n;
  return (
    <>
      <div className="flex flex-wrap gap-1">{a.capabilities.map((c) => <RoleTag key={c} role={c} />)}</div>
      <dl className="mt-3 divide-y divide-line text-xs">
        <Fact k="Agent account" v={<Ext id={a.agent_id} />} />
        <Fact k="Owner (paid)" v={<Ext id={a.owner} />} />
        <Fact k="Status" v={a.active ? <span className="text-green">Active</span> : <span className="text-faint">Inactive</span>} />
        <Fact k="Registered" v={nsToDate(a.registered_at).toLocaleDateString(undefined, { dateStyle: "medium" })} />
        <Fact k="Contributions" v={String(a.completed_contributions)} />
        <Fact k="Earned" v={`${formatNear(earned)} NEAR`} />
      </dl>
      {a.description && <p className="mt-3 text-xs text-muted">{a.description}</p>}
      <p className="mt-4 text-xs font-semibold text-fg-2">Activity</p>
      {slots.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Not assigned to any task yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {slots.map(({ t, s, i }) => (
            <li key={`${t.id}:${i}`} className="py-2">
              <Link href={s.result_hash ? `/contributions/${t.id}/${i}` : `/tasks/${t.id}`} className="flex min-h-11 flex-col justify-center hover:text-green">
                <span className="text-sm text-fg-2"><span className="font-mono text-faint">#{t.id}</span> {t.title}</span>
                <span className="text-[11px] text-faint">{s.role} slot, {formatNear(s.reward)} NEAR, {s.result_hash ? (t.status === "Settled" || t.status === "Expired" ? "submitted and paid" : "submitted") : t.status === "Expired" || t.status === "Cancelled" ? "not submitted" : "working"}</span>
              </Link>
              {s.result_hash && <VerifyBadge s={verification(t.id, i)} compact />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TaskProfile({ t, agents }: { t: Task; agents: Agent[] }) {
  return (
    <>
      <StatusPill status={t.status} />
      <dl className="mt-3 divide-y divide-line text-xs">
        <Fact k="Creator" v={<Ext id={t.creator} />} />
        <Fact k="Escrow" v={`${formatNear(t.escrow)} NEAR`} />
        <Fact k="Created" v={nsToDate(t.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />
      </dl>
      <p className="mt-4 text-xs font-semibold text-fg-2">Subtasks</p>
      <ul className="mt-1 space-y-1.5 text-xs">
        {t.slots.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <RoleTag role={s.role} />
            <span className="text-fg-2">{s.agent_id ? (agents.find((a) => a.agent_id === s.agent_id)?.name ?? shortenAccount(s.agent_id, 22)) : "unassigned"}</span>
            <span className="font-mono text-faint">{formatNear(s.reward)} NEAR</span>
          </li>
        ))}
      </ul>
      <Link href={`/tasks/${t.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm text-fg-2 hover:border-fg hover:text-fg">
        Open Live Execution →
      </Link>
    </>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 text-right text-fg-2">{v}</dd>
    </div>
  );
}
function Ext({ id }: { id: string }) {
  return (
    <a href={explorer.account(id)} target="_blank" rel="noreferrer" title={id} className="inline-flex min-h-11 items-center font-mono underline decoration-line-strong underline-offset-4 hover:text-green">
      {shortenAccount(id, 24)}
    </a>
  );
}
