"use client";
// New task: describe → POST /plan → review roles, split, briefs (+ client-side checks) →
// wallet create_task with the plan's exact args and deposit → POST /tasks/:id/description →
// open Live Execution. The plan, description and task id are saved in the browser before each
// step, so a wallet redirect or a closed tab never loses a funded task's description.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { explorer, network } from "@/config/network";
import { CoordinatorError, postDescription, postPlan, type Plan } from "@/lib/coordinatorApi";
import { CONTRACT_ID, findTaskByHash, formatNear, sha256Hex, viewAccount, type Task } from "@/lib/near";
import { TGAS, type TxResult } from "@/lib/tx";
import { refreshChainData } from "@/lib/useChainData";
import { useCoordinatorHealth } from "@/lib/useCoordinatorHealth";
import { useWallet } from "@/lib/wallet";
import { RoleTag } from "../Tags";
import { TxButton } from "../TxButton";

const STORE_KEY = "conflux.newTask";
const MIN_DEADLINE_LEFT_MS = 10 * 60 * 1000;
const GAS_BUFFER = 10n ** 22n; // 0.01 NEAR kept free for gas

interface Pending {
  account: string;
  contractId: string;
  title: string;
  description: string;
  descriptionHash: string;
  taskId: number | null;
  createTx: string | null;
  descriptionPosted: boolean;
  planLinked: boolean | null;
}
const readPending = (): Pending | null => {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Pending | null;
    return p && p.contractId === CONTRACT_ID ? p : null;
  } catch {
    return null;
  }
};
const writePending = (p: Pending | null) => {
  try {
    if (p) localStorage.setItem(STORE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* best effort */
  }
};

type Check = { label: string; ok: boolean; detail?: string };

const input =
  "w-full rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-green focus:outline-none";

export function NewTaskFlow() {
  const router = useRouter();
  const health = useCoordinatorHealth();
  const { accountId, call } = useWallet();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("0.1");
  const [hours, setHours] = useState("3");
  const [phase, setPhase] = useState<"form" | "planning" | "review">("form");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [posting, setPosting] = useState<{ s: "idle" | "posting" | "error"; error?: string }>({ s: "idle" });

  useEffect(() => setPending(readPending()), []);

  // ---- Form validation (mirrors the contract and coordinator rules) ----
  const titleChars = [...title.trim()].length;
  const budgetOk = /^\d+(\.\d{1,4})?$/.test(budget.trim()) && Number(budget) >= 0.01;
  const hoursN = Number(hours);
  const hoursOk = Number.isInteger(hoursN) && hoursN >= 1 && hoursN <= 720;
  const formErrors = [
    titleChars < 1 || titleChars > 100 ? "Title: 1 to 100 characters." : null,
    !description.trim() || description.length > 5000 ? "Description: 1 to 5000 characters." : null,
    !budgetOk ? "Budget: at least 0.01 NEAR, up to 4 decimals." : null,
    !hoursOk ? "Deadline: a whole number of hours, 1 to 720." : null,
  ].filter(Boolean) as string[];

  const runPlan = async () => {
    setPhase("planning");
    setPlanError(null);
    try {
      const p = await postPlan({ title: title.trim(), description, budget_near: budget.trim(), deadline_hours: hoursN });
      setPlan(p);
      setPhase("review");
    } catch (e) {
      setPlanError(e instanceof CoordinatorError ? e.message : String(e));
      setPhase("form");
    }
  };

  // ---- Review checks (all must pass before the Fund button is enabled) ----
  const runChecks = useCallback(async () => {
    if (!plan) return;
    const a = plan.create_task.args;
    const hash = await sha256Hex(plan.description);
    const sum = a.slots.reduce((s, x) => s + BigInt(x.reward), BigInt(a.coordinator_fee));
    const deadlineMs = Number(BigInt(a.deadline) / 1_000_000n);
    const deposit = BigInt(plan.create_task.attached_deposit);
    const bal = accountId ? await viewAccount(accountId).catch(() => null) : null;
    const list: Check[] = [
      { label: `Plan targets this contract (${CONTRACT_ID})`, ok: plan.create_task.contract_id === CONTRACT_ID, detail: plan.create_task.contract_id },
      { label: "Description hash matches the text that will be posted", ok: hash === plan.description_hash && hash === a.description_hash },
      { label: "Description is the text you wrote", ok: plan.description === description },
      { label: "Rewards plus fee equal the budget exactly", ok: sum === BigInt(plan.budget), detail: `${formatNear(sum, 6)} of ${formatNear(plan.budget, 6)} NEAR` },
      { label: "Every role has an active agent", ok: plan.slots.every((s) => s.agents.length > 0) },
      { label: "Deadline is at least 10 minutes away", ok: deadlineMs - Date.now() > MIN_DEADLINE_LEFT_MS, detail: new Date(deadlineMs).toLocaleString() },
      {
        label: "Wallet connected with enough balance",
        ok: !!bal && BigInt(bal.amount) >= deposit + GAS_BUFFER,
        detail: !accountId ? "connect a wallet" : bal ? `${formatNear(bal.amount, 4)} NEAR available, ${formatNear(deposit + GAS_BUFFER, 4)} needed` : "balance unknown",
      },
    ];
    setChecks(list);
  }, [plan, accountId, description]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);
  const allOk = !!checks && checks.every((c) => c.ok);

  // ---- Fund (create_task) ----
  const fund = async (): Promise<TxResult> => {
    if (!plan || !accountId) return { ok: false, txHash: null, error: "Not ready." };
    const base: Pending = {
      account: accountId,
      contractId: CONTRACT_ID,
      title: plan.title,
      description: plan.description,
      descriptionHash: plan.description_hash,
      taskId: null,
      createTx: null,
      descriptionPosted: false,
      planLinked: null,
    };
    writePending(base); // saved before signing, in case the wallet redirects away
    const r = await call({
      methodName: "create_task",
      args: plan.create_task.args,
      deposit: plan.create_task.attached_deposit,
      gas: (50n * TGAS).toString(),
    });
    if (!r.ok) {
      writePending(null);
      return r;
    }
    let id = (r.value as Task | null)?.id ?? null;
    if (id === null) id = (await findTaskByHash(accountId, plan.description_hash))?.id ?? null;
    const p = { ...base, taskId: id, createTx: r.txHash };
    writePending(p);
    setPending(p);
    void refreshChainData();
    if (id !== null) void postDesc(p);
    return r;
  };

  // ---- Post description, then open Live Execution ----
  const postDesc = async (p: Pending) => {
    if (p.taskId === null) return;
    setPosting({ s: "posting" });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await postDescription(p.taskId, p.description);
        const done = { ...p, descriptionPosted: true, planLinked: r.plan_linked };
        writePending(null);
        setPending(done);
        setPosting({ s: "idle" });
        router.push(`/tasks/${p.taskId}`);
        return;
      } catch (e) {
        // 404/502 right after creation can mean the RPC has not seen the block yet: retry.
        if (attempt === 3) setPosting({ s: "error", error: e instanceof CoordinatorError ? e.message : String(e) });
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  const shares = useMemo(() => {
    if (!plan) return [];
    const total = plan.slots.reduce((s, x) => s + Number(x.reward_near), 0);
    return plan.slots.map((s) => (total ? (Number(s.reward_near) / total) * 100 : 0));
  }, [plan]);

  const offline = health.state === "offline";

  // ---- Unfinished task from an earlier session: offer to finish it ----
  if (pending && !pending.descriptionPosted && pending.taskId !== null) {
    return (
      <section className="mt-6 rounded-xl border border-green/40 bg-green/5 p-5">
        <h2 className="text-sm font-semibold">Task #{pending.taskId} is funded. Its description is not posted yet.</h2>
        <p className="mt-2 text-sm text-fg-2">
          The coordinator only assigns agents after it has the description. &ldquo;{pending.title}&rdquo; was created by{" "}
          <span className="font-mono">{pending.account}</span>.
        </p>
        {pending.createTx && (
          <a className="mt-2 inline-flex min-h-11 items-center text-xs text-green underline underline-offset-2" href={explorer.tx(pending.createTx)} target="_blank" rel="noreferrer">
            create_task transaction ↗
          </a>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void postDesc(pending)}
            disabled={posting.s === "posting" || offline}
            className="inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {posting.s === "posting" ? "Posting description…" : "Post description"}
          </button>
          <Link href={`/tasks/${pending.taskId}`} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm text-fg-2 hover:border-fg">
            Open task #{pending.taskId}
          </Link>
        </div>
        {offline && <p className="mt-2 text-xs text-bad">Coordinator offline. Start it to post the description.</p>}
        {posting.s === "error" && <p className="mt-2 text-xs text-bad" role="alert">{posting.error}</p>}
      </section>
    );
  }
  if (pending && pending.taskId === null) {
    return (
      <section className="mt-6 rounded-xl border border-bad/40 bg-bad/5 p-5">
        <h2 className="text-sm font-semibold">A create_task transaction was sent, but the task id is unknown.</h2>
        <p className="mt-2 text-sm text-fg-2">Check the Tasks list for a task titled &ldquo;{pending.title}&rdquo; by {pending.account}, then post its description from there.</p>
        <button onClick={() => { writePending(null); setPending(null); }} className="mt-3 inline-flex min-h-11 items-center text-xs text-muted underline">
          Dismiss
        </button>
      </section>
    );
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        {offline && (
          <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm" role="alert">
            <p className="font-semibold text-bad">Coordinator offline. Task planning needs it.</p>
            <p className="mt-1 text-xs text-muted">{health.state === "offline" ? health.reason : ""}</p>
          </div>
        )}

        {phase !== "review" && (
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">1. Describe the task</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="flex justify-between text-xs text-muted">
                  <span>Title (public, on chain)</span>
                  <span className={titleChars > 100 ? "text-bad" : ""}>{titleChars}/100</span>
                </span>
                <input className={`${input} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Analyze NEAR Intents" maxLength={120} />
              </label>
              <label className="block">
                <span className="flex justify-between text-xs text-muted">
                  <span>Description (only its hash goes on chain)</span>
                  <span className={description.length > 5000 ? "text-bad" : ""}>{description.length}/5000</span>
                </span>
                <textarea
                  className={`${input} mt-1.5 min-h-36 resize-y`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What should the agents find out? What matters most?"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-muted">Budget in NEAR (10% goes to the coordinator)</span>
                  <input className={`${input} mt-1.5 font-mono`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-xs text-muted">Deadline in hours</span>
                  <input className={`${input} mt-1.5 font-mono`} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
                </label>
              </div>
            </div>
            {formErrors.length > 0 && (title || description) && (
              <ul className="mt-4 space-y-1 text-xs text-bad">
                {formErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {planError && (
              <p className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs text-bad" role="alert">
                Planning failed: {planError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void runPlan()}
                disabled={formErrors.length > 0 || phase === "planning" || offline || health.state === "checking"}
                className="inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === "planning" ? "Planning with NEAR AI…" : "Plan roles and rewards"}
              </button>
              <span className="text-xs text-faint">
                {phase === "planning" ? "One signed NEAR AI call. Usually 10 to 40 seconds." : "Nothing is signed or paid at this step."}
              </span>
            </div>
          </section>
        )}

        {phase === "review" && plan && (
          <section className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">2. Review the plan</h2>
                <p className="mt-1 text-lg font-semibold">{plan.title}</p>
              </div>
              <button onClick={() => { setPhase("form"); setPlan(null); setChecks(null); }} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm text-fg-2 hover:border-fg">
                Edit and re-plan
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-faint">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Role</th>
                    <th className="px-3 py-2.5 font-semibold">Why</th>
                    <th className="px-3 py-2.5 font-semibold">Agents</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.slots.map((s, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-5 py-3">
                        <RoleTag role={s.role} />
                      </td>
                      <td className="px-3 py-3 text-fg-2">{s.reason}</td>
                      <td className="px-3 py-3 text-xs text-muted">{s.agents.join(", ") || "none"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-mono">
                        {s.reward_near} NEAR
                        <div className="text-[11px] text-faint">{shares[i]?.toFixed(0)}%</div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-5 py-3 text-xs text-muted" colSpan={3}>
                      Coordinator fee (10%)
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono">{formatNear(plan.coordinator_fee, 6)} NEAR</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-5 py-3" colSpan={3}>
                      Escrow (budget)
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-green">{formatNear(plan.budget, 6)} NEAR</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-2 border-t border-line p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Briefs each agent receives</h3>
              {plan.slots.map((s, i) => (
                <details key={i} className="rounded-lg border border-line bg-bg/50">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm">
                    <RoleTag role={s.role} /> <span className="text-fg-2">brief</span>
                  </summary>
                  <p className="whitespace-pre-wrap px-3 pb-3 text-sm leading-relaxed text-fg-2">{s.brief}</p>
                </details>
              ))}
              {plan.fixes.length > 0 && (
                <p className="text-xs text-faint">Adjusted by code: {plan.fixes.join(" ")}</p>
              )}
              <p className="font-mono text-[11px] text-faint">
                Plan signed: {plan.proof.kind}, {plan.proof.model.split("/").pop()}, signer {plan.proof.signing_address.slice(0, 8)}…{plan.proof.signing_address.slice(-4)}
              </p>
            </div>

            <div className="border-t border-line p-5">
              <h3 className="text-sm font-semibold">3. Fund it</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {(checks ?? []).map((c) => (
                  <li key={c.label} className="flex gap-2">
                    <span className={c.ok ? "text-green" : "text-bad"} aria-hidden>
                      {c.ok ? "✓" : "✕"}
                    </span>
                    <span className={c.ok ? "text-fg-2" : "text-bad"}>
                      {c.label}
                      {c.detail && <span className="text-faint">. {c.detail}</span>}
                    </span>
                  </li>
                ))}
                {!checks && <li className="text-muted">Checking…</li>}
              </ul>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-2">
{`${CONTRACT_ID}.create_task
  deposit  ${formatNear(plan.create_task.attached_deposit, 6)} NEAR  (budget + 0.05 storage allowance, unused part refunded)
  gas      50 Tgas
  deadline ${new Date(plan.create_task.deadline_iso).toLocaleString()}`}
              </pre>
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <TxButton
                  label={`Fund task with ${formatNear(plan.create_task.attached_deposit, 4)} NEAR`}
                  run={fund}
                  disabled={!allOk || posting.s === "posting"}
                  disabledReason={!allOk ? "All checks must pass first." : undefined}
                />
                <button onClick={() => void runChecks()} className="inline-flex min-h-11 items-center text-xs text-muted underline underline-offset-2 hover:text-fg">
                  Re-run checks
                </button>
              </div>
              {posting.s === "posting" && <p className="mt-3 text-sm text-fg-2">Funded. Posting the description to the coordinator…</p>}
              {posting.s === "error" && pending && (
                <div className="mt-3 text-sm" role="alert">
                  <p className="text-bad">The task is funded, but posting the description failed: {posting.error}</p>
                  <button onClick={() => void postDesc(pending)} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm hover:border-fg">
                    Retry posting description
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="h-fit rounded-xl border border-line bg-surface p-5 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">What happens</h2>
        <ol className="mt-3 space-y-3 text-fg-2">
          {[
            ["Plan", "The coordinator asks NEAR AI for roles, a reward split and a brief per role. Free for you."],
            ["Fund", `You sign create_task. The contract holds the budget in escrow on NEAR ${network.label}.`],
            ["Describe", "The site posts your description. The coordinator checks it against the on-chain hash."],
            ["Run", "Agents are assigned, research, and submit signed reports. You approve to pay them."],
          ].map(([h, b], i) => (
            <li key={h} className="flex gap-3">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] ${phaseIndex(phase) >= i ? "bg-green-soft text-green" : "bg-surface-2 text-faint"}`}>
                {i + 1}
              </span>
              <span>
                <span className="font-semibold text-fg">{h}.</span> {b}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
          You can cancel and get the escrow back only while no agent is assigned (status Funded).
        </p>
      </aside>
    </div>
  );
}

const phaseIndex = (p: "form" | "planning" | "review") => (p === "review" ? 1 : 0);
