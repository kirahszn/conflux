"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatNear, nsToDate, type Task, type TaskStatus } from "@/lib/near";
import { useChainData } from "@/lib/useChainData";
import { shortenAccount } from "../Account";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";

const ACTIVE: TaskStatus[] = ["Funded", "InProgress", "Submitted"];
const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "finished", label: "Finished" },
] as const;

const when = (ns: string) => nsToDate(ns).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Every task on the contract, newest first. Polled every 10s. */
export function TasksTable() {
  const { data, retry } = useChainData({ refreshMs: 10_000 });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const rows = useMemo(() => {
    if (data.state !== "ready") return [];
    const all = [...data.tasks].sort((a, b) => b.id - a.id);
    if (filter === "active") return all.filter((t) => ACTIVE.includes(t.status));
    if (filter === "finished") return all.filter((t) => !ACTIVE.includes(t.status));
    return all;
  }, [data, filter]);

  if (data.state === "error") return <ErrorState message={data.message} onRetry={retry} />;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <div className="flex gap-1" role="tablist" aria-label="Filter tasks">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${filter === f.id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
            >
              {f.label}
              {data.state === "ready" && (
                <span className="ml-1.5 font-mono text-[11px] text-faint">
                  {f.id === "all" ? data.tasks.length : data.tasks.filter((t) => (f.id === "active" ? ACTIVE.includes(t.status) : !ACTIVE.includes(t.status))).length}
                </span>
              )}
            </button>
          ))}
        </div>
        {data.state === "ready" && <span className="font-mono text-[11px] text-faint">Updated {data.loadedAt.toLocaleTimeString()}</span>}
      </div>

      {data.state === "loading" ? (
        <div className="space-y-3 p-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={filter === "active" ? "No active tasks." : filter === "finished" ? "No finished tasks yet." : "No tasks yet."}>
            Create one with <Link href="/tasks/new" className="inline-flex min-h-11 items-center text-green underline underline-offset-2">New task</Link>.
          </EmptyState>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-line md:hidden">
          {rows.map((t) => (
            <TaskCard key={t.id} t={t} />
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Task</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Roles</th>
                <th className="px-3 py-2.5 text-right font-semibold">Escrow</th>
                <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Creator</th>
                <th className="px-4 py-2.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: Task }) {
  const submitted = t.slots.filter((s) => s.result_hash).length;
  return (
    <tr className="group hover:bg-surface-2/60">
      <td className="px-4 py-2">
        <Link href={`/tasks/${t.id}`} className="flex min-h-11 flex-col justify-center">
          <span className="font-medium text-fg group-hover:text-green">
            <span className="font-mono text-faint">#{t.id}</span> {t.title}
          </span>
        </Link>
      </td>
      <td className="px-3 py-2">
        <StatusPill status={t.status} />
        <div className="mt-1 text-[11px] text-faint">
          {submitted}/{t.slots.length} submitted
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {t.slots.map((s, i) => (
            <RoleTag key={i} role={s.role} />
          ))}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{formatNear(t.escrow)} NEAR</td>
      <td className="hidden px-3 py-2 font-mono text-xs text-fg-2 lg:table-cell" title={t.creator}>
        {shortenAccount(t.creator, 22)}
      </td>
      <td className="px-4 py-2 text-xs text-muted">{when(t.created_at)}</td>
    </tr>
  );
}

/** Phone layout: one stacked card per task. */
function TaskCard({ t }: { t: Task }) {
  const submitted = t.slots.filter((s) => s.result_hash).length;
  return (
    <li>
      <Link href={`/tasks/${t.id}`} className="block px-4 py-3 hover:bg-surface-2/60">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-medium text-fg">
            <span className="font-mono text-faint">#{t.id}</span> {t.title}
          </span>
          <StatusPill status={t.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {t.slots.map((s, i) => (
            <RoleTag key={i} role={s.role} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-mono text-fg-2">{formatNear(t.escrow)} NEAR</span>
          <span>
            {submitted}/{t.slots.length} submitted
          </span>
          <span>{when(t.created_at)}</span>
        </div>
      </Link>
    </li>
  );
}
