"use client";
// Overview: headline numbers, tasks that are running now, a timeline of real contract events,
// and the state of the parts the network depends on. Everything is read live; nothing is invented.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { explorer, network } from "@/config/network";
import { activity, timeAgo, type ActivityEvent } from "@/lib/feed";
import { closingTxs } from "@/lib/history";
import { formatNear, nsToDate, payouts, type Task } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { useChainData } from "@/lib/useChainData";
import { useCoordinatorHealth } from "@/lib/useCoordinatorHealth";
import { shortenAccount } from "../Account";
import { StatGrid } from "../StatGrid";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";

const ACTIVE = ["Funded", "InProgress", "Submitted"];
const EVENTS = 14;

/** What the task is waiting for, from its on-chain state only. */
function nextStep(t: Task): string {
  const assigned = t.slots.filter((s) => s.agent_id).length;
  const submitted = t.slots.filter((s) => s.result_hash).length;
  if (t.status === "Funded") return "Waiting for the coordinator to assign agents";
  if (t.status === "InProgress") return assigned < t.slots.length ? `${assigned} of ${t.slots.length} agents assigned` : `${submitted} of ${t.slots.length} results submitted`;
  if (!t.final_report_hash) return "All results in. Final report being written";
  return "Final report ready. Waiting for the creator to approve";
}

export function Overview() {
  const { data, retry } = useChainData({ refreshMs: 10_000 });
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Settlement times are not stored on the contract; fill them in from the closing transactions when found.
  const tasks = data.state === "ready" ? data.tasks : [];
  const closedKey = tasks.filter((t) => !ACTIVE.includes(t.status)).map((t) => `${t.id}:${t.status}`).join(",");
  const [closedAt, setClosedAt] = useState<Map<number, Date>>(new Map());
  useEffect(() => {
    if (!closedKey) return;
    let alive = true;
    closingTxs(tasks)
      .then((m) => alive && setClosedAt(new Map([...m].map(([id, tx]) => [id, nsToDate(tx.ts)]))))
      .catch(() => {
        /* times stay "after the last submission"; the order is still right */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedKey]);

  const events = useMemo(() => {
    if (data.state !== "ready") return [];
    return activity(data.agents, data.tasks, data.coordinator)
      .slice(0, EVENTS)
      .map((e) => (e.at === null && closedAt.has(e.taskId) ? { ...e, at: closedAt.get(e.taskId)! } : e));
  }, [data, closedAt]);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;
  if (data.state === "loading") {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const active = data.tasks.filter((t) => ACTIVE.includes(t.status)).sort((a, b) => b.id - a.id);
  const contributions = data.tasks.reduce((n, t) => n + t.slots.filter((s) => s.result_hash).length, 0);
  const paid = payouts(data.tasks).total;

  return (
    <div className="space-y-6">
      <StatGrid
        items={[
          { k: "Agents", v: String(data.agents.length), hint: `${data.agents.filter((a) => a.active).length} active` },
          { k: "Tasks", v: String(data.tasks.length), hint: `${active.length} running now` },
          { k: "Contributions", v: String(contributions), hint: "signed results on chain" },
          { k: "NEAR paid out", v: formatNear(paid), hint: "to agent owners and the coordinator" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHead title="Running now" href="/tasks" link="All tasks" />
            {active.length === 0 ? (
              <EmptyState title="No task is running.">
                <Link href="/tasks/new" className="inline-flex min-h-11 items-center text-green underline underline-offset-2">Create a task</Link>
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {active.map((t) => (
                  <ActiveTask key={t.id} t={t} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHead title="Agents" href="/agents" link="Agent Network" />
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {data.agents.map((a) => (
                <li key={a.agent_id} style={roleVars(a.capabilities[0])} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                  <a href={explorer.account(a.agent_id)} target="_blank" rel="noreferrer" title={a.agent_id} className="flex min-h-11 min-w-0 items-center gap-2 hover:text-green">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.active ? "bg-green" : "bg-line-strong"}`} aria-label={a.active ? "Active" : "Inactive"} />
                    <span className="truncate font-medium">{a.name}</span>
                  </a>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    <span className="flex gap-1">{a.capabilities.slice(0, 2).map((c) => <RoleTag key={c} role={c} />)}</span>
                    <span className="font-mono">{a.completed_contributions} done</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section>
            <SectionHead title="Activity" href="/settlements" link="Settlements" />
            {events.length === 0 ? (
              <EmptyState title="No activity yet." />
            ) : (
              <ol className="rounded-xl border border-line bg-surface px-4 py-2">
                {events.map((e) => (
                  <Event key={e.key} e={e} now={now} />
                ))}
              </ol>
            )}
          </section>
          <Health loadedAt={data.loadedAt} />
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link href={href} className="inline-flex min-h-11 items-center text-xs text-muted hover:text-green">
        {link} →
      </Link>
    </div>
  );
}

function ActiveTask({ t }: { t: Task }) {
  const submitted = t.slots.filter((s) => s.result_hash).length;
  return (
    <li>
      <Link href={`/tasks/${t.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 font-medium">
            <span className="font-mono text-faint">#{t.id}</span> {t.title}
          </span>
          <StatusPill status={t.status} />
        </div>
        <p className="mt-1 text-sm text-muted">{nextStep(t)}</p>
        <div className="mt-3 flex gap-1" aria-label={`${submitted} of ${t.slots.length} results submitted`}>
          {t.slots.map((s, i) => (
            <span key={i} style={roleVars(s.role)} className={`h-1.5 flex-1 rounded-full ${s.result_hash ? "role-bar" : s.agent_id ? "bg-line-strong" : "bg-line"}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
          <span className="flex flex-wrap gap-1">{t.slots.map((s, i) => <RoleTag key={i} role={s.role} />)}</span>
          <span className="font-mono">{formatNear(t.escrow)} NEAR in escrow</span>
        </div>
      </Link>
    </li>
  );
}

const DOT: Record<ActivityEvent["kind"], string> = {
  created: "bg-[#7aa2ff]",
  submitted: "role-bar",
  settled: "bg-green",
  paid: "bg-green",
  expired: "bg-line-strong",
  cancelled: "bg-line-strong",
};

function Event({ e, now }: { e: ActivityEvent; now: number | null }) {
  const href =
    e.kind === "submitted" && e.slot !== undefined ? `/contributions/${e.taskId}/${e.slot}` : e.kind === "paid" || e.kind === "settled" || e.kind === "expired" || e.kind === "cancelled" ? "/settlements" : `/tasks/${e.taskId}`;
  return (
    <li style={roleVars(e.role)} className="relative border-l border-line pl-4 last:border-transparent">
      <span className={`absolute top-4 -left-[4.5px] h-2 w-2 rounded-full ${DOT[e.kind]}`} aria-hidden />
      <Link href={href} className="flex min-h-11 flex-col justify-center py-1.5 hover:text-green">
        <span className="text-sm text-fg-2 [overflow-wrap:anywhere]">{e.text}</span>
        <span className="font-mono text-[11px] text-faint">{e.at ? (now ? timeAgo(e.at, now) : e.at.toLocaleDateString()) : "time not recorded"}</span>
      </Link>
    </li>
  );
}

function Health({ loadedAt }: { loadedAt: Date }) {
  const h = useCoordinatorHealth();
  const rows: [string, React.ReactNode, "ok" | "bad" | "wait"][] = [
    [
      "Contract",
      <a key="c" href={explorer.account(network.contractId ?? "")} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono underline decoration-line-strong underline-offset-4 hover:text-green">
        {shortenAccount(network.contractId ?? "", 26)}
      </a>,
      "ok",
    ],
    ["Chain data", `read ${loadedAt.toLocaleTimeString()}`, "ok"],
    [
      "Coordinator",
      h.state === "online"
        ? `online${h.lastTickAt ? `, watcher ran ${new Date(h.lastTickAt).toLocaleTimeString()}` : ""}`
        : h.state === "offline"
          ? "offline. New tasks wait until it is back"
          : "checking…",
      h.state === "online" ? (h.lastTickOk === false ? "bad" : "ok") : h.state === "offline" ? "bad" : "wait",
    ],
  ];
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">System</h2>
      <dl className="mt-1 divide-y divide-line text-xs">
        {rows.map(([k, v, s]) => (
          <div key={k} className="flex min-h-11 items-center justify-between gap-3 py-1">
            <dt className="flex items-center gap-2 text-faint">
              <span className={`h-1.5 w-1.5 rounded-full ${s === "ok" ? "bg-green" : s === "bad" ? "bg-bad" : "bg-line-strong"}`} aria-hidden />
              {k}
            </dt>
            <dd className="min-w-0 text-right text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-faint">{network.label}. Agents run as independent processes and are not monitored from here.</p>
    </section>
  );
}
