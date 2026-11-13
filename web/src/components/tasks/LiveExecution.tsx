"use client";
// Live Execution (/tasks/[id]): pipeline, one lane per agent, final report and disagreements,
// valid actions only, settlement. Chain is polled every 4s; coordinator data is re-read when the
// chain changes. Animation only marks real activity (an active stage, a submission that just landed).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import snapshot from "@/data/task3.json";
import { explorer, network } from "@/config/network";
import { LANE_LABEL, laneState, parseProofRef, pipeline, taskPayouts, validActions, nsToMs, type LaneState, type Stage } from "@/lib/live";
import { formatNear, nsToDate, type Agent, type Task } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { disagreeBullets, structureDisagreement, type Disagreement, type Showcase } from "@/lib/showcase";
import { ONE_YOCTO, TGAS, type TxResult } from "@/lib/tx";
import { useCoordTask, type CoordView } from "@/lib/useCoordTask";
import { refreshChainData, useChainData, useTask } from "@/lib/useChainData";
import { useCoordinatorHealth } from "@/lib/useCoordinatorHealth";
import { useWallet } from "@/lib/wallet";
import { shortenAccount } from "../Account";
import { Page, PageHeader } from "../PageHeader";
import { ReportView } from "../ReportView";
import { VerifyBadge, verifyState, type VerifyState } from "../VerifyBadge";
import { TaskGraph } from "../graph/LiveGraphs";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";
import { TxButton } from "../TxButton";

const short = (h: string, a = 8, b = 6) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
const time = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function until(ms: number, now: number) {
  const d = ms - now;
  if (d <= 0) return "passed";
  const h = Math.floor(d / 3_600_000);
  const m = Math.floor((d % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function LiveExecution({ idParam }: { idParam: string }) {
  const id = /^\d+$/.test(idParam) ? Number(idParam) : null;
  const { data, reload } = useTask(id, 4000);
  const chain = useChainData();
  const health = useCoordinatorHealth();
  const task = data.state === "ready" ? data.task : null;
  const coord = useCoordTask(task);
  const now = useNow();

  if (id === null) return <Page><EmptyState title="Not a task id." /></Page>;
  if (data.state === "loading") return <Page><Skeleton className="h-8 w-72" /><Skeleton className="mt-6 h-24 w-full" /><Skeleton className="mt-6 h-64 w-full" /></Page>;
  if (data.state === "error") return <Page><ErrorState message={data.message} onRetry={reload} /></Page>;
  if (data.state === "missing" || !task) {
    return (
      <Page>
        <EmptyState title={`Task #${id} does not exist on this contract.`}>
          <Link className="inline-flex min-h-11 items-center text-green underline underline-offset-2" href="/tasks">All tasks</Link>
        </EmptyState>
      </Page>
    );
  }

  const agents = new Map<string, Agent>(chain.data.state === "ready" ? chain.data.agents.map((a) => [a.agent_id, a]) : []);
  const coordinator = chain.data.state === "ready" ? chain.data.coordinator : "";
  // This task from the fast 4s poll, the rest from the shared chain data.
  const allTasks = chain.data.state === "ready" ? chain.data.tasks.map((t) => (t.id === task.id ? task : t)) : [task];
  const view = coord.state === "ready" ? coord.view : null;
  const active = task.status === "Funded" || task.status === "InProgress" || task.status === "Submitted";
  const snap = !view && network.showcase?.taskId === task.id ? (snapshot as Showcase) : null;
  const refresh = () => {
    reload();
    void refreshChainData();
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`Task #${task.id} · Live Execution`}
        title={task.title}
        description={
          <>
            Created by <span className="font-mono text-fg-2">{task.creator}</span> on {time(nsToMs(task.created_at))}. Deadline {time(nsToMs(task.deadline))} ({until(nsToMs(task.deadline), now)}).
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            {active && (
              <span className="inline-flex items-center gap-2 text-xs text-muted" title="Reading the contract every 4 seconds">
                <span className="live-dot h-2 w-2 rounded-full bg-green" aria-hidden />
                Live
              </span>
            )}
            <StatusPill status={task.status} />
          </div>
        }
      />

      <Pipeline stages={pipeline(task, view?.task ?? null, health.state === "online", now)} active={active} />

      {/* Below xl the actions sit right under the pipeline, so the creator can act without scrolling. */}
      <div className="mt-6 xl:hidden">
        <Actions task={task} now={now} onDone={refresh} />
      </div>

      <section aria-labelledby="who" className="mt-6">
        <h2 id="who" className="text-sm font-semibold">Who is working on this task</h2>
        <p className="mt-1 text-xs text-muted">Owners, their agents, the shared task, its creator and the coordinator. Lines are on-chain relationships. Select one to inspect it.</p>
        <div className="mt-3">
          <TaskGraph task={task} agents={[...agents.values()]} tasks={allTasks} coordinator={coordinator} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="lanes">
            <h2 id="lanes" className="text-sm font-semibold">Agents</h2>
            <div className="mt-3 space-y-3">
              {task.slots.map((_, i) => (
                <Lane key={i} task={task} i={i} agents={agents} view={view} verify={verifyState(coord, view?.slotVerification[i])} />
              ))}
            </div>
          </section>

          <FinalReport task={task} view={view} coordState={coord.state} snapshot={snap} agents={agents} verify={verifyState(coord, view?.synthVerification)} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="hidden xl:block">
            <Actions task={task} now={now} onDone={refresh} />
          </div>
          <Facts task={task} view={view} />
          <Settlement task={task} agents={agents} coordinator={coordinator} />
          <CoordinatorNote state={coord.state} health={health.state} snapshot={!!snap} />
        </div>
      </div>
    </Page>
  );
}

// ---- Pipeline -------------------------------------------------------------------------
const STAGE_STYLE: Record<Stage["state"], { dot: string; text: string; label: string }> = {
  done: { dot: "bg-green border-green", text: "text-fg", label: "Done" },
  current: { dot: "bg-bg border-green", text: "text-fg", label: "Now" },
  waiting: { dot: "bg-bg border-line-strong", text: "text-muted", label: "Waiting" },
  stopped: { dot: "bg-bad/30 border-bad", text: "text-muted", label: "Stopped" },
  unknown: { dot: "bg-bg border-line-strong border-dashed", text: "text-muted", label: "Unknown" },
};

function Pipeline({ stages, active }: { stages: Stage[]; active: boolean }) {
  return (
    <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 sm:[&>li:last-child]:col-span-2 lg:grid-cols-4 lg:[&>li:last-child]:col-span-2 xl:grid-cols-7 xl:[&>li:last-child]:col-span-1" aria-label="Pipeline">
      {stages.map((s, i) => {
        const st = STAGE_STYLE[s.state];
        return (
          <li key={s.key} className="bg-surface p-3.5" aria-current={s.state === "current" ? "step" : undefined}>
            <div className="flex items-center gap-2">
              <span className={`relative grid h-4 w-4 place-items-center rounded-full border-2 ${st.dot}`} aria-hidden>
                {s.state === "current" && active && <span className="live-dot absolute inset-0 rounded-full" />}
                {s.state === "done" && <span className="text-[9px] font-bold leading-none text-ink">✓</span>}
              </span>
              <span className="font-mono text-[10px] text-faint">{i + 1}</span>
              <span className={`text-sm font-semibold ${st.text}`}>{s.label}</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted">
              <span className="sr-only">{st.label}: </span>
              {s.detail}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Agent lane -------------------------------------------------------------------------
const LANE_DOT: Record<LaneState, string> = {
  unassigned: "bg-line-strong",
  assigned: "bg-[#f0b429]",
  submitted: "bg-green",
  verified: "bg-green",
  paid: "bg-green",
  unpaid: "bg-bad",
};

function Lane({ task, i, agents, view, verify }: { task: Task; i: number; agents: Map<string, Agent>; view: CoordView | null; verify: VerifyState }) {
  const s = task.slots[i]!;
  const a = s.agent_id ? agents.get(s.agent_id) : undefined;
  const state = laneState(task, i, view?.task ?? null);
  const proof = parseProofRef(s.proof_ref);
  const cs = view?.task.slots[i];
  const gather = cs?.proof && "write" in cs.proof ? cs.proof.gather : undefined;
  const verified = view?.slotVerified[i] ?? null;
  const reason = view?.plan?.slots[i]?.role === s.role ? view.plan.slots[i]!.reason : null;

  // Flash once when a submission lands while the page is open (real activity only).
  const prev = useRef(s.result_hash);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!prev.current && s.result_hash) {
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 6000);
      prev.current = s.result_hash;
      return () => clearTimeout(t);
    }
    prev.current = s.result_hash;
  }, [s.result_hash]);

  return (
    <article style={roleVars(s.role)} className={`overflow-hidden rounded-xl border bg-surface transition ${fresh ? "border-green shadow-[0_0_0_3px_rgb(0_236_151/0.25)]" : "border-line"}`}>
      <div className="flex">
        <div className="role-bar w-1 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <RoleTag role={s.role} />
              <span className="font-semibold">{a?.name ?? (s.agent_id ? shortenAccount(s.agent_id, 26) : "Unassigned slot")}</span>
            </div>
            <span className="font-mono text-sm">{formatNear(s.reward)} NEAR</span>
          </div>
          {reason && <p className="mt-1 text-xs text-muted">{reason}</p>}

          <p className="mt-3 flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 shrink-0 rounded-full ${LANE_DOT[state]}`} aria-hidden />
            <span className={state === "assigned" || state === "unassigned" ? "text-muted" : "text-fg"}>{LANE_LABEL[state]}</span>
            {fresh && <span className="rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-semibold text-green">just landed</span>}
          </p>

          <dl className="mt-3 grid items-center gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {s.agent_id && <Row k="Agent" v={<ExtLink href={explorer.account(s.agent_id)}>{shortenAccount(s.agent_id, 28)}</ExtLink>} />}
            {a && <Row k="Owner (paid)" v={<ExtLink href={explorer.account(a.owner)}>{shortenAccount(a.owner, 28)}</ExtLink>} />}
            {s.submitted_at && <Row k="Submitted" v={time(nsToMs(s.submitted_at))} />}
            {s.result_hash && (
              <Row
                k="result_hash"
                v={
                  <span className="font-mono" title={s.result_hash}>
                    {short(s.result_hash)}{" "}
                    {verified === true && <span className="text-green">matches report ✓</span>}
                    {verified === false && <span className="text-bad">does not match the stored report</span>}
                  </span>
                }
              />
            )}
            {proof && <Row k="Proof" v={<span className="font-mono">{proof.kind}{gather?.kind ? ` (search: ${gather.kind})` : ""}</span>} />}
            {proof && <Row k="Model" v={<span className="font-mono">{proof.model.split("/").pop()}</span>} />}
            {proof && <Row k="Signer" v={<span className="font-mono" title={proof.signer}>{short(proof.signer, 8, 4)}</span>} />}
            {proof && <Row k="Chat id" v={<span className="font-mono" title={proof.chatId}>{short(proof.chatId, 13, 6)}</span>} />}
            {s.result_hash && !proof && s.proof_ref && <Row k="proof_ref" v={<span className="font-mono break-all">{s.proof_ref}</span>} />}
          </dl>

          {s.result_hash && (
            <div className="mt-3">
              <VerifyBadge s={verify} />
            </div>
          )}
          {cs?.result && (
            <details className="mt-3 rounded-lg border border-line bg-bg/50">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-fg-2">Read {a?.name ?? "agent"} report ({cs.result.length.toLocaleString()} characters)</summary>
              <div className="border-t border-line px-4 pb-4">
                <ReportView markdown={cs.result} />
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 sm:justify-start">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 text-right text-fg-2 sm:text-left">{v}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
      {children}
    </a>
  );
}

// ---- Final report + disagreements -------------------------------------------------------
function FinalReport({ task, view, coordState, snapshot, agents, verify }: { task: Task; view: CoordView | null; coordState: string; snapshot: Showcase | null; agents: Map<string, Agent>; verify: VerifyState }) {
  const names = useMemo(() => [...agents.values()].map((a) => a.name), [agents]);
  const disagreements: { list: Disagreement[]; raw: string[]; count: number } = useMemo(() => {
    if (view?.report) {
      const raw = disagreeBullets(view.report);
      const list = raw.map((b) => structureDisagreement(b, names)).filter((d): d is Disagreement => d !== null);
      return { list, raw, count: raw.length };
    }
    if (snapshot) return { list: snapshot.synthesis.disagreements, raw: [], count: snapshot.synthesis.disagreement_count };
    return { list: [], raw: [], count: 0 };
  }, [view, snapshot, names]);
  // agent name -> the role it held in this task (via its agent_id)
  const nameRole = (n: string) => {
    const agent = [...agents.values()].find((a) => a.name === n);
    return task.slots.find((s) => s.agent_id === agent?.agent_id)?.role ?? null;
  };
  const fr = view?.task.final_report;

  return (
    <section aria-labelledby="report" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="report" className="text-sm font-semibold">Aggregated result</h2>
        {task.final_report_hash ? (
          <span className="font-mono text-xs text-muted" title={task.final_report_hash}>
            final_report_hash {short(task.final_report_hash)}{" "}
            {view?.reportVerified === true && <span className="text-green">matches report ✓</span>}
            {view?.reportVerified === false && <span className="text-bad">does not match</span>}
          </span>
        ) : (
          <span className="text-xs text-muted">{task.status === "Submitted" ? "Being written by the coordinator" : "Not written yet"}</span>
        )}
      </div>

      <div className="p-4">
        {task.final_report_hash && (
          <div className="mb-3">
            <VerifyBadge s={verify} />
          </div>
        )}
        {!task.final_report_hash && (
          <p className="text-sm text-muted">
            {task.status === "Submitted"
              ? `All agents have submitted. The coordinator writes one signed synthesis and puts its hash on chain.${fr ? ` Attempts so far: ${fr.attempts}.` : ""}${fr?.last_error ? ` Last error: ${fr.last_error}` : ""}`
              : task.status === "Cancelled" || task.status === "Expired"
                ? `No final report: the task is ${task.status.toLowerCase()}.`
                : "The coordinator writes the final report once every agent has submitted."}
          </p>
        )}

        {(disagreements.count > 0 || disagreements.list.length > 0) && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">
              Where the agents disagree {snapshot && !view && <span className="normal-case tracking-normal text-muted">(from saved snapshot)</span>}
            </h3>
            <p className="mt-1 text-xs text-muted">The synthesis flagged {disagreements.count} disagreement{disagreements.count === 1 ? "" : "s"}. Figures side by side:</p>
            <div className="mt-3 space-y-3">
              {disagreements.list.slice(0, 4).map((d) => (
                <div key={d.topic} className="rounded-lg border border-line bg-bg/40 p-3">
                  <p className="text-sm font-semibold">{d.topic}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {d.claims.map((c) => (
                      <div key={c.agent} style={roleVars(nameRole(c.agent))} className="light-scope role-tag rounded-lg p-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em]">{c.agent}</p>
                        <p className="mt-0.5 text-sm text-fg">{c.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {disagreements.raw.length > disagreements.list.slice(0, 4).length && (
              <details className="mt-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm text-fg-2">All {disagreements.raw.length} disagreements as written</summary>
                <ReportView markdown={disagreements.raw.map((b) => `- ${b}`).join("\n")} />
              </details>
            )}
          </div>
        )}

        {view?.report && (
          <details className="mt-4 rounded-lg border border-line bg-bg/50">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-fg-2">Read the full final report ({view.report.length.toLocaleString()} characters)</summary>
            <div className="border-t border-line px-4 pb-4">
              <ReportView markdown={view.report} />
            </div>
          </details>
        )}
        {task.final_report_hash && !view?.report && (
          <p className="mt-3 text-xs text-muted">
            {coordState === "offline" ? "The report text lives with the coordinator, which is offline. Its hash above is on chain." : "Loading the report from the coordinator…"}
          </p>
        )}
        {fr?.synthesis_proof && (
          <p className="mt-3 font-mono text-[11px] text-faint">
            Synthesis signed: {fr.synthesis_proof.kind}, {fr.synthesis_proof.model.split("/").pop()}, signer {short(fr.synthesis_proof.signing_address, 8, 4)}
            {fr.tx && (
              <>
                {" · "}
                <a className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-green" href={explorer.tx(fr.tx)} target="_blank" rel="noreferrer">
                  set_final_report tx ↗
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

// ---- Actions (valid ones only) -------------------------------------------------------------
function Actions({ task, now, onDone }: { task: Task; now: number; onDone: () => void }) {
  const { accountId, call } = useWallet();
  const v = validActions(task, accountId, now);
  const send = (methodName: string, gas: bigint) => (): Promise<TxResult> => call({ methodName, args: { task_id: task.id }, deposit: ONE_YOCTO, gas: (gas * TGAS).toString() });
  const after = (r: TxResult) => r.ok && onDone();
  const any = v.approve || v.release || v.expire || v.cancel;

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="actions">
      <h2 id="actions" className="text-sm font-semibold">Actions</h2>
      <div className="mt-3 space-y-4">
        {v.approve && (
          <div>
            <p className="mb-2 text-xs text-muted">Pays every agent owner and the coordinator from escrow. 1 yoctoNEAR confirms it is you.</p>
            <TxButton label="Approve and pay" run={send("approve_task", 100n)} onResult={after} />
          </div>
        )}
        {v.release && (
          <div>
            <p className="mb-2 text-xs text-muted">The 24 hour review period has passed. Anyone can release the payment.</p>
            <TxButton label="Release payment" variant="secondary" run={send("release_payment", 100n)} onResult={after} />
          </div>
        )}
        {v.expire && (
          <div>
            <p className="mb-2 text-xs text-muted">The deadline passed. Submitted slots are paid, the rest of the escrow comes back to you.</p>
            <TxButton label="Expire task" variant="danger" run={send("expire_task", 100n)} onResult={after} />
          </div>
        )}
        {v.cancel && (
          <div>
            <p className="mb-2 text-xs text-muted">No agent is assigned yet. Cancel to get the full escrow back.</p>
            <TxButton label="Cancel task" variant="danger" run={send("cancel_task", 30n)} onResult={after} />
          </div>
        )}
        {!any && (
          <p className="text-sm text-muted">
            {!accountId
              ? "Connect a wallet to act on this task."
              : v.approveWaiting && v.isCreator
                ? "Approve becomes available when the final report hash is on chain."
                : task.status === "Submitted" && !v.isCreator
                  ? `Only ${task.creator} can approve.${v.releaseAt ? ` Anyone can release payment after ${time(v.releaseAt)}.` : ""}`
                  : task.status === "InProgress"
                    ? `Nothing to do while agents work. ${v.isCreator ? `If they miss the deadline (${until(nsToMs(task.deadline), now)}), you can expire it.` : ""}`
                    : task.status === "Settled" || task.status === "Expired" || task.status === "Cancelled"
                      ? "This task is final. No actions left."
                      : "No action available for your account."}
          </p>
        )}
        {task.status === "Submitted" && v.releaseAt && !v.release && v.approve && (
          <p className="text-xs text-faint">If you do not approve, anyone can release payment after {time(v.releaseAt)}.</p>
        )}
      </div>
    </section>
  );
}

// ---- Facts, settlement, coordinator note ----------------------------------------------------
function Facts({ task, view }: { task: Task; view: CoordView | null }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 text-sm">
      <h2 className="text-sm font-semibold">Task</h2>
      <dl className="mt-3 space-y-1.5 text-xs">
        {[
          ["Escrow", `${formatNear(task.escrow)} NEAR`],
          ["Coordinator fee", `${formatNear(task.coordinator_fee)} NEAR`],
          ["Created", nsToDate(task.created_at).toLocaleString()],
          ["Deadline", nsToDate(task.deadline).toLocaleString()],
          ...(task.submitted_at ? [["All submitted", nsToDate(task.submitted_at).toLocaleString()]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-faint">{k}</dt>
            <dd className="text-right font-mono text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
      {view?.task.description && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs text-fg-2">Description (hash matches chain)</summary>
          <p className="whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">{view.task.description}</p>
        </details>
      )}
      {view?.plan && <p className="mt-2 font-mono text-[11px] text-faint">Plan signed: {view.plan.proof.kind}, {view.plan.proof.model.split("/").pop()}</p>}
    </section>
  );
}

function Settlement({ task, agents, coordinator }: { task: Task; agents: Map<string, Agent>; coordinator: string }) {
  const payouts = taskPayouts(task, agents, coordinator);
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Settlement</h2>
      {payouts.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{formatNear(task.escrow)} NEAR held in escrow until the task settles, expires or is cancelled.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {payouts.map((p) => (
            <li key={`${p.to}-${p.label}`} style={roleVars(p.role)} className="flex items-center justify-between gap-3 py-1.5">
              <a href={explorer.account(p.to)} target="_blank" rel="noreferrer" className="flex min-h-11 min-w-0 flex-col justify-center hover:text-green">
                <span className="text-xs text-fg-2">{p.label}</span>
                <span className="font-mono text-[11px] text-muted">{shortenAccount(p.to, 24)}</span>
              </a>
              <span className="shrink-0 font-mono text-sm text-green">+{formatNear(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoordinatorNote({ state, health, snapshot }: { state: string; health: string; snapshot: boolean }) {
  if (state === "ready") return null;
  return (
    <section className={`rounded-xl border p-4 text-xs ${health === "offline" ? "border-bad/40 bg-bad/5" : "border-line bg-surface"}`}>
      <p className="font-semibold text-fg">{health === "offline" ? "Coordinator offline" : "Reading the coordinator…"}</p>
      <p className="mt-1 text-muted">
        {health === "offline"
          ? `Status, agents, hashes, proofs and actions come straight from the contract and keep working. Report texts and disagreements need the coordinator.${snapshot ? " The disagreements shown come from the saved task #3 snapshot." : ""}`
          : "Report texts and checks load from the coordinator."}
      </p>
    </section>
  );
}
