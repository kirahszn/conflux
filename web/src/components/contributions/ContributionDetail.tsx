"use client";
// One contribution: what the contract records for the slot, the signed submission transaction,
// the inference proof reference, and the agent's report (shown only when its sha256 matches the
// result_hash on chain).
import Link from "next/link";
import { useEffect, useState } from "react";
import { explorer } from "@/config/network";
import { submissionTx, type FoundTx } from "@/lib/history";
import { parseProofRef, type CoordProofPart } from "@/lib/live";
import { formatNear, nsToDate, type Agent } from "@/lib/near";
import { roleVars } from "@/lib/roles";
import { useChainData, useTask } from "@/lib/useChainData";
import { useCoordTask } from "@/lib/useCoordTask";
import { shortenAccount } from "../Account";
import { Page, PageHeader } from "../PageHeader";
import { ReportView } from "../ReportView";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { RoleTag, StatusPill } from "../Tags";
import { VerifyBadge, verifyState } from "../VerifyBadge";
import { PAYMENT_LABEL, payment } from "./ContributionsTable";

const when = (ns: string) => nsToDate(ns).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

type TxLookup = { state: "loading" } | { state: "done"; tx: FoundTx | null } | { state: "error"; message: string };

export function ContributionDetail({ taskParam, slotParam }: { taskParam: string; slotParam: string }) {
  const taskId = /^\d+$/.test(taskParam) ? Number(taskParam) : null;
  const slotIndex = /^\d+$/.test(slotParam) ? Number(slotParam) : null;
  const { data: taskData } = useTask(taskId, 15_000);
  const { data } = useChainData();
  const task = taskData.state === "ready" ? taskData.task : null;
  const slot = task && slotIndex !== null ? task.slots[slotIndex] : undefined;
  const coord = useCoordTask(task);

  const [txl, setTxl] = useState<TxLookup>({ state: "loading" });
  const key = task && slot ? `${task.id}|${slotIndex}|${slot.result_hash}` : "";
  useEffect(() => {
    if (!task || slotIndex === null || !slot?.result_hash) return;
    let alive = true;
    submissionTx(task, slotIndex)
      .then((tx) => alive && setTxl({ state: "done", tx }))
      .catch((e: unknown) => alive && setTxl({ state: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const title = slot ? `${slot.role[0]!.toUpperCase()}${slot.role.slice(1)} contribution` : "Contribution";
  const header = <PageHeader eyebrow={<Link href="/contributions" className="inline-flex min-h-11 items-center hover:underline">Contributions</Link>} title={title} description={task ? <>Task <Link href={`/tasks/${task.id}`} className="inline-flex min-h-11 items-center gap-1 text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green"><span className="font-mono">#{task.id}</span> {task.title}</Link></> : undefined} />;

  if (taskId === null || slotIndex === null || taskData.state === "missing" || (task && !slot)) {
    return (
      <Page>
        {header}
        <div className="mt-6">
          <EmptyState title="No such contribution.">
            The contract has no {taskId === null ? "task with that id" : `slot ${slotParam} on task ${taskParam}`}. <Link href="/contributions" className="inline-flex min-h-11 items-center text-green underline underline-offset-2">See all contributions</Link>.
          </EmptyState>
        </div>
      </Page>
    );
  }
  if (taskData.state === "error") {
    return (
      <Page>
        {header}
        <div className="mt-6"><ErrorState message={taskData.message} /></div>
      </Page>
    );
  }
  if (!task || !slot) {
    return (
      <Page>
        {header}
        <div className="mt-6 space-y-3" aria-busy>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }

  const agent: Agent | undefined = slot.agent_id && data.state === "ready" ? data.agents.find((a) => a.agent_id === slot.agent_id) : undefined;
  const proof = parseProofRef(slot.proof_ref);
  const view = coord.state === "ready" ? coord.view : null;
  const cs = view?.task.slots[slotIndex];
  const parts = cs?.proof && "write" in cs.proof ? cs.proof : null;
  const verified = view?.slotVerified[slotIndex] ?? null;

  if (!slot.result_hash) {
    return (
      <Page>
        {header}
        <div className="mt-6">
          <EmptyState title="Nothing submitted for this slot yet.">
            {slot.agent_id ? `${agent?.name ?? slot.agent_id} is assigned to the ${slot.role} role.` : `The ${slot.role} role has no agent yet.`}{" "}
            <Link href={`/tasks/${task.id}`} className="inline-flex min-h-11 items-center text-green underline underline-offset-2">Follow the task live</Link>.
          </EmptyState>
        </div>
      </Page>
    );
  }

  const pay = payment(task);
  return (
    <Page>
      {header}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section style={roleVars(slot.role)} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex">
              <div className="role-bar w-1 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleTag role={slot.role} />
                    <span className="font-semibold">{agent?.name ?? shortenAccount(slot.agent_id!, 28)}</span>
                  </div>
                  <StatusPill status={task.status} />
                </div>
                <dl className="mt-3 divide-y divide-line text-sm">
                  <Fact k="Agent" v={<Ext href={explorer.account(slot.agent_id!)} title={slot.agent_id!}>{shortenAccount(slot.agent_id!, 30)}</Ext>} />
                  {agent && <Fact k="Owner (paid)" v={<Ext href={explorer.account(agent.owner)} title={agent.owner}>{shortenAccount(agent.owner, 30)}</Ext>} />}
                  <Fact k="Reward" v={<span className="font-mono">{formatNear(slot.reward)} NEAR <span className={pay === "paid" ? "text-green" : "text-[#f0b429]"}>{PAYMENT_LABEL[pay]}</span></span>} />
                  <Fact k="Submitted" v={when(slot.submitted_at!)} />
                  <Fact
                    k="Transaction"
                    v={
                      txl.state === "loading" ? (
                        <span className="text-muted">Looking it up…</span>
                      ) : txl.state === "error" ? (
                        <span className="text-bad">{txl.message}</span>
                      ) : txl.tx ? (
                        <Ext href={explorer.tx(txl.tx.hash)} title={txl.tx.hash}>{txl.tx.hash.slice(0, 12)}… signed by the agent</Ext>
                      ) : (
                        <span className="text-muted">Not found automatically. <Ext href={explorer.account(slot.agent_id!)}>See the agent&apos;s transactions</Ext></span>
                      )
                    }
                  />
                </dl>
                <div className="mt-3">
                  <VerifyBadge s={verifyState(coord, view?.slotVerification[slotIndex])} />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Report</h2>
            {verified === true && cs?.result ? (
              <>
                <p className="mt-1 text-xs text-green">sha256 of this report matches the result_hash on chain ✓</p>
                <div className="mt-2 border-t border-line pt-1">
                  <ReportView markdown={cs.result} />
                </div>
              </>
            ) : verified === false ? (
              <p className="mt-2 text-sm text-bad">The coordinator&apos;s stored report does not match the result_hash on chain, so it is not shown.</p>
            ) : coord.state === "offline" ? (
              <p className="mt-2 text-sm text-muted">The report text lives with the coordinator, which is offline. The contract keeps only its hash, shown on the right.</p>
            ) : coord.state === "error" ? (
              <p className="mt-2 text-sm text-bad">{coord.message}</p>
            ) : coord.state === "loading" ? (
              <Skeleton className="mt-3 h-32 w-full" />
            ) : (
              <p className="mt-2 text-sm text-muted">The coordinator has no stored report for this slot.</p>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">On chain</h2>
            <p className="mt-2 text-xs text-faint">result_hash (sha256 of the report)</p>
            <p className="mt-0.5 break-all font-mono text-xs text-fg-2">{slot.result_hash}</p>
            <p className="mt-3 text-xs text-faint">proof_ref</p>
            <p className="mt-0.5 break-all font-mono text-xs text-fg-2">{slot.proof_ref ?? "none"}</p>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">Inference proof</h2>
            {proof ? (
              <>
                <dl className="mt-2 divide-y divide-line text-xs">
                  <Fact k="Provider" v={<span className="font-mono">{proof.provider}</span>} />
                  <Fact k="Kind" v={<span className="font-mono">{proof.kind}</span>} />
                  <Fact k="Model" v={<span className="break-all font-mono">{proof.model}</span>} />
                  <Fact k="Chat id" v={<span className="break-all font-mono">{proof.chatId}</span>} />
                  <Fact k="Signing address" v={<span className="break-all font-mono">{proof.signer}</span>} />
                </dl>
                {parts && <ProofParts gather={parts.gather ?? null} write={parts.write ?? null} />}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">This submission carries no parsable proof reference.</p>
            )}
          </section>
        </aside>
      </div>
    </Page>
  );
}

function ProofParts({ gather, write }: { gather: CoordProofPart | null; write: CoordProofPart | null }) {
  const rows = [
    ["Search step", gather],
    ["Writing step", write],
  ] as const;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs text-faint">Steps recorded by the coordinator</p>
      <ul className="mt-1 space-y-1 text-xs">
        {rows.map(([label, p]) =>
          p ? (
            <li key={label} className="text-fg-2">
              <span className="text-faint">{label}:</span> <span className="font-mono">{p.kind}</span>, <span className="font-mono">{p.model.split("/").pop()}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-4 py-1">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 text-right text-fg-2">{v}</dd>
    </div>
  );
}

function Ext({ href, title, children }: { href: string; title?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className="inline-flex min-h-11 items-center font-mono underline decoration-line-strong underline-offset-4 hover:text-green">
      {children}
    </a>
  );
}
