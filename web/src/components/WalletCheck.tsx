"use client";
// Wallet signing round trip (Stage 4.3 step 3): create a tiny task, then cancel it.
// The description is never posted to the coordinator, so no agent is ever assigned and the task
// stays Funded, which is the only status cancel_task accepts. Not linked from the navigation.
import { useCallback, useEffect, useState } from "react";
import { explorer, network } from "@/config/network";
import { formatNear, findTaskByHash, nearToYocto, sha256Hex, viewAccount, type Task } from "@/lib/near";
import { ONE_YOCTO, TGAS, type TxResult } from "@/lib/tx";
import { refreshChainData, useTask } from "@/lib/useChainData";
import { useWallet } from "@/lib/wallet";
import { Account } from "./Account";
import { Page, PageHeader } from "./PageHeader";
import { StatusPill } from "./Tags";
import { TxButton } from "./TxButton";

const BUDGET = "0.03"; // escrow = reward + fee
const REWARD = "0.027";
const FEE = "0.003";
const STORAGE_ALLOWANCE = "0.02"; // attached on top; the contract keeps only the measured storage and refunds the rest
const STORE_KEY = "conflux.walletCheck";

interface Saved {
  account: string;
  before: string; // yocto balance before the create transaction
  descriptionHash: string;
  taskId: number | null;
  createTx: string | null;
  cancelTx: string | null;
}
const loadSaved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (s: Saved | null) => {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* per-viewer convenience only */
  }
};

export function WalletCheck() {
  const { accountId, call } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [args, setArgs] = useState<{ description: string; hash: string; deadline: string } | null>(null);
  const { data: task } = useTask(saved?.taskId ?? null, 3000);

  const loadBalance = useCallback(async () => {
    if (!accountId) return setBalance(null);
    const a = await viewAccount(accountId).catch(() => null);
    setBalance(a?.amount ?? null);
  }, [accountId]);

  useEffect(() => {
    void loadBalance();
    const s = loadSaved();
    setSaved(s && s.account === accountId ? s : null);
  }, [accountId, loadBalance]);

  // Prepare the exact create_task arguments (shown before signing).
  useEffect(() => {
    const description = `Conflux wallet signing test by ${accountId ?? "?"} at ${new Date().toISOString()}. This description is never posted, so no agent is assigned.`;
    void sha256Hex(description).then((hash) =>
      setArgs({ description, hash, deadline: String(BigInt(Date.now() + 60 * 60 * 1000) * 1_000_000n) }),
    );
  }, [accountId]);

  const update = (s: Saved) => {
    setSaved(s);
    save(s);
  };

  const create = async (): Promise<TxResult> => {
    if (!accountId || !args) return { ok: false, txHash: null, error: "Not ready." };
    const before = (await viewAccount(accountId))?.amount ?? "0";
    const r = await call({
      methodName: "create_task",
      args: {
        title: "Wallet signing test",
        description_hash: args.hash,
        slots: [{ role: "research", reward: nearToYocto(REWARD) }],
        coordinator_fee: nearToYocto(FEE),
        deadline: args.deadline,
      },
      deposit: (BigInt(nearToYocto(BUDGET)) + BigInt(nearToYocto(STORAGE_ALLOWANCE))).toString(),
      gas: (50n * TGAS).toString(),
    });
    if (r.ok) {
      let id = (r.value as Task | null)?.id ?? null;
      if (id === null) id = (await findTaskByHash(accountId, args.hash))?.id ?? null; // wallet returned no value
      update({ account: accountId, before, descriptionHash: args.hash, taskId: id, createTx: r.txHash, cancelTx: null });
      void refreshChainData();
      void loadBalance();
    }
    return r;
  };

  const cancel = async (): Promise<TxResult> => {
    if (!saved?.taskId && saved?.taskId !== 0) return { ok: false, txHash: null, error: "No test task yet." };
    const r = await call({ methodName: "cancel_task", args: { task_id: saved.taskId }, deposit: ONE_YOCTO, gas: (30n * TGAS).toString() });
    if (r.ok) {
      update({ ...saved, cancelTx: r.txHash });
      void refreshChainData();
      setTimeout(() => void loadBalance(), 2500);
    }
    return r;
  };

  const t = task.state === "ready" ? task.task : null;
  const diff = saved && balance ? BigInt(saved.before) - BigInt(balance) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Diagnostics"
        title="Wallet check"
        description={`Proves signing end to end on NEAR ${network.label}: create a tiny task, then cancel it. The description is never posted, so no agent is assigned.`}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          {accountId ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Signed in as</dt>
                <dd>
                  <Account id={accountId} max={30} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Balance now</dt>
                <dd className="font-mono">{balance ? `${formatNear(balance, 6)} NEAR` : "…"}</dd>
              </div>
              {saved && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Balance before the test</dt>
                  <dd className="font-mono">{formatNear(saved.before, 6)} NEAR</dd>
                </div>
              )}
              {diff !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Spent so far</dt>
                  <dd className="font-mono">{formatNear(diff < 0n ? 0n : diff, 6)} NEAR</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">Connect your wallet from the top bar.</p>
          )}
          <button onClick={() => void loadBalance()} className="mt-3 inline-flex min-h-11 items-center text-xs text-muted underline underline-offset-2 hover:text-fg">
            Refresh balance
          </button>
        </section>

        <section className="min-w-0 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">1. Create test task</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-2">
{`create_task
  title            "Wallet signing test"
  slots            [research: ${REWARD} NEAR]
  coordinator_fee  ${FEE} NEAR
  deadline         now + 1 hour
  description_hash ${args ? `${args.hash.slice(0, 16)}…` : "…"}
deposit ${BUDGET} escrow + ${STORAGE_ALLOWANCE} storage allowance
        (unused allowance is refunded)`}
          </pre>
          <div className="mt-4">
            <TxButton label="Create test task" run={create} disabled={!args || !!(saved && saved.taskId !== null && !saved.cancelTx)} disabledReason={saved && saved.taskId !== null && !saved.cancelTx ? "Cancel the current test task first." : undefined} />
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">2. Cancel it (1 yoctoNEAR)</h2>
          {saved?.taskId !== null && saved?.taskId !== undefined ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <p>
                  Task <span className="font-mono">#{saved.taskId}</span> status:{" "}
                  {t ? <StatusPill status={t.status} /> : <span className="text-muted">reading…</span>}{" "}
                  {t && <span className="text-xs text-faint">(read from the contract every 3s)</span>}
                </p>
                {t && <p className="text-xs text-muted">Escrow {formatNear(t.escrow)} NEAR, slot agent: {t.slots[0]?.agent_id ?? "none assigned"}</p>}
                {saved.createTx && (
                  <p className="text-xs">
                    <a className="text-green underline underline-offset-2" href={explorer.tx(saved.createTx)} target="_blank" rel="noreferrer">
                      create_task transaction ↗
                    </a>
                  </p>
                )}
                {saved.cancelTx && (
                  <p className="text-xs">
                    <a className="text-green underline underline-offset-2" href={explorer.tx(saved.cancelTx)} target="_blank" rel="noreferrer">
                      cancel_task transaction ↗
                    </a>
                  </p>
                )}
              </div>
              <TxButton
                label={`Cancel task #${saved.taskId}`}
                variant="danger"
                run={cancel}
                disabled={!t || t.status !== "Funded" || t.creator !== accountId}
                disabledReason={t && t.status !== "Funded" ? `Only a Funded task can be cancelled. This one is ${t.status}.` : undefined}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Create the test task first.</p>
          )}
          {saved?.cancelTx && (
            <button onClick={() => { save(null); setSaved(null); }} className="mt-4 inline-flex min-h-11 items-center text-xs text-muted underline underline-offset-2 hover:text-fg">
              Reset this check
            </button>
          )}
        </section>
      </div>
    </Page>
  );
}
