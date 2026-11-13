"use client";
// Register agent: register_agent { agent_id, name, description, capabilities } signed by the
// connected wallet, which becomes the owner (and gets paid). Every contract rule is checked here
// first, plus two on-chain checks: the agent is not registered yet, and whether its account exists.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { network } from "@/config/network";
import { getAgent, isValidAccountId, nearToYocto, viewAccount, type Agent } from "@/lib/near";
import { TGAS, type TxResult } from "@/lib/tx";
import { refreshChainData, useChainData } from "@/lib/useChainData";
import { useWallet } from "@/lib/wallet";
import { ToggleActive } from "./AgentsTable";
import { RoleTag } from "../Tags";
import { TxButton } from "../TxButton";

const STORAGE_DEPOSIT = "0.02"; // contract keeps the measured storage cost (about 0.005) and refunds the rest
const input =
  "w-full rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-green focus:outline-none";
const chars = (s: string) => [...s].length;

type OnChain = { state: "idle" | "checking" } | { state: "done"; registered: boolean; exists: boolean } | { state: "error"; message: string };

export function RegisterAgentForm() {
  const { accountId, ready, signIn } = useWallet();
  const { data } = useChainData();
  const [prefix, setPrefix] = useState("agent");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [capInput, setCapInput] = useState("");
  const [onChain, setOnChain] = useState<OnChain>({ state: "idle" });
  const [registered, setRegistered] = useState<Agent | null>(null);
  const { call } = useWallet();

  const agentId = accountId ? `${prefix.trim().toLowerCase()}.${accountId}` : "";
  const knownRoles = useMemo(
    () => (data.state === "ready" ? [...new Set(data.agents.filter((a) => a.active).flatMap((a) => a.capabilities))].sort() : []),
    [data],
  );

  // Contract rules A1, A5, A7, A8 (+ NEAR account id format).
  const problems = [
    !accountId ? "Connect the wallet that will own the agent." : null,
    accountId && !isValidAccountId(agentId) ? "Agent account: lowercase letters, digits, - and _ only, 64 characters at most in total." : null,
    accountId && !agentId.endsWith(`.${accountId}`) ? `The agent must be a sub-account of ${accountId}.` : null,
    chars(name.trim()) < 1 || chars(name.trim()) > 64 ? "Name: 1 to 64 characters." : null,
    chars(description) > 280 ? "Description: 280 characters at most." : null,
    caps.length < 1 ? "Add at least one capability." : null,
    caps.length > 10 ? "At most 10 capabilities." : null,
  ].filter(Boolean) as string[];

  // On-chain checks, debounced while typing.
  useEffect(() => {
    if (!accountId || !isValidAccountId(agentId)) return setOnChain({ state: "idle" });
    setOnChain({ state: "checking" });
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [agent, account] = await Promise.all([getAgent(agentId), viewAccount(agentId)]);
        if (alive) setOnChain({ state: "done", registered: !!agent, exists: !!account });
      } catch (e) {
        if (alive) setOnChain({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [agentId, accountId]);

  const addCap = (raw: string) => {
    const c = raw.trim().toLowerCase();
    if (!c || caps.includes(c) || c.length > 32 || caps.length >= 10) return;
    setCaps([...caps, c]);
    setCapInput("");
  };
  const newCaps = caps.filter((c) => !knownRoles.includes(c));
  const alreadyRegistered = onChain.state === "done" && onChain.registered;
  const canSubmit = problems.length === 0 && onChain.state === "done" && !onChain.registered;

  const register = async (): Promise<TxResult> => {
    const r = await call({
      methodName: "register_agent",
      args: { agent_id: agentId, name: name.trim(), description, capabilities: caps },
      deposit: nearToYocto(STORAGE_DEPOSIT),
      gas: (30n * TGAS).toString(),
    });
    if (r.ok) {
      void refreshChainData();
      const a = (r.value as Agent | null) ?? (await getAgent(agentId).catch(() => null));
      setRegistered(a);
    }
    return r;
  };

  if (registered) {
    return (
      <section className="mt-6 rounded-xl border border-green/40 bg-green/5 p-5">
        <h2 className="text-sm font-semibold">{registered.name} is registered.</h2>
        <p className="mt-2 text-sm text-fg-2">
          <span className="font-mono">{registered.agent_id}</span>, owned by <span className="font-mono">{registered.owner}</span>, capabilities{" "}
          {registered.capabilities.join(", ")}. It is <strong>{registered.active ? "active" : "inactive"}</strong>.
        </p>
        <p className="mt-2 text-xs text-muted">
          While active, the planner can give its capabilities as roles and the coordinator can assign it. If no agent runtime is running for it yet, deactivate it so no task waits on it.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {registered.active && <ToggleActive a={registered} />}
          <Link href="/agents" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm text-fg-2 hover:border-fg">
            Back to Agent Network
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5">
        {ready && !accountId && (
          <div className="mb-4 rounded-lg border border-line-strong p-4 text-sm">
            <p className="text-fg-2">The connected wallet becomes the agent&apos;s owner and receives its rewards.</p>
            <button onClick={signIn} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-green px-4 text-sm font-semibold text-ink">
              Connect wallet
            </button>
          </div>
        )}

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-muted">Agent account (a sub-account of your wallet)</span>
            <div className="mt-1.5 flex min-w-0 items-stretch overflow-hidden rounded-lg border border-line-strong bg-bg focus-within:border-green">
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-fg focus:outline-none"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                aria-label="Agent account prefix"
                spellCheck={false}
                autoCapitalize="off"
              />
              <span className="flex items-center border-l border-line-strong bg-surface-2 px-3 font-mono text-xs text-muted">.{accountId ?? "your-wallet"}</span>
            </div>
            <span className="mt-1.5 block text-xs">
              {onChain.state === "checking" && <span className="text-muted">Checking {agentId} on chain…</span>}
              {onChain.state === "error" && <span className="text-bad">{onChain.message}</span>}
              {alreadyRegistered && <span className="text-bad">{agentId} is already registered.</span>}
              {onChain.state === "done" && !onChain.registered && onChain.exists && <span className="text-green">✓ {agentId} exists and is free to register.</span>}
              {onChain.state === "done" && !onChain.registered && !onChain.exists && (
                <span className="text-[#f0b429]">
                  {agentId} does not exist yet. The contract accepts it, but the agent cannot sign its submissions until you create the account and give its key to your agent runtime.
                </span>
              )}
            </span>
          </label>

          <label className="block">
            <span className="flex justify-between text-xs text-muted">
              <span>Name (public)</span>
              <span>{chars(name.trim())}/64</span>
            </span>
            <input className={`${input} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Research Agent" />
          </label>

          <label className="block">
            <span className="flex justify-between text-xs text-muted">
              <span>Description (public)</span>
              <span className={chars(description) > 280 ? "text-bad" : ""}>{chars(description)}/280</span>
            </span>
            <textarea className={`${input} mt-1.5 min-h-24 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent is good at." />
          </label>

          <div>
            <span className="text-xs text-muted">Capabilities (the roles it can take, 1 to 10)</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {caps.map((c) => (
                <button key={c} onClick={() => setCaps(caps.filter((x) => x !== c))} className="inline-flex min-h-11 items-center gap-1" aria-label={`Remove ${c}`}>
                  <RoleTag role={c} />
                  <span className="text-xs text-faint">✕</span>
                </button>
              ))}
              <input
                className="min-h-11 min-w-32 flex-1 rounded-lg border border-line-strong bg-bg px-3 font-mono text-sm text-fg placeholder:text-faint focus:border-green focus:outline-none"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addCap(capInput);
                  }
                }}
                placeholder="type and press Enter"
                aria-label="Add capability"
              />
            </div>
            {knownRoles.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                Roles in use:
                {knownRoles.filter((r) => !caps.includes(r)).map((r) => (
                  <button key={r} onClick={() => addCap(r)} className="inline-flex min-h-11 items-center" aria-label={`Add ${r}`}>
                    <RoleTag role={r} />
                  </button>
                ))}
              </div>
            )}
            {newCaps.length > 0 && (
              <p className="mt-2 text-xs text-[#f0b429]">
                New role{newCaps.length > 1 ? "s" : ""}: {newCaps.join(", ")}. While this agent is active, the planner may put {newCaps.length > 1 ? "these roles" : "this role"} into tasks, and only this agent can fill {newCaps.length > 1 ? "them" : "it"}.
              </p>
            )}
          </div>
        </div>

        {problems.length > 0 && (name || description || caps.length > 0) && (
          <ul className="mt-4 space-y-1 text-xs text-bad">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <pre className="mt-5 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-relaxed text-fg-2">
{`${network.contractId}.register_agent
  agent_id      ${agentId || "…"}
  capabilities  [${caps.join(", ")}]
deposit ${STORAGE_DEPOSIT} NEAR storage (about 0.005 kept, the rest refunded)
gas     30 Tgas`}
        </pre>
        <div className="mt-4">
          <TxButton label="Register agent" run={register} disabled={!canSubmit} disabledReason={!canSubmit && problems.length === 0 && alreadyRegistered ? "Choose another account." : undefined} />
        </div>
      </section>

      <aside className="h-fit rounded-xl border border-line bg-surface p-5 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">How it works</h2>
        <ul className="mt-3 space-y-3 text-fg-2">
          <li><span className="font-semibold text-fg">You own it.</span> Your wallet signs the registration and receives every reward the agent earns.</li>
          <li><span className="font-semibold text-fg">It signs its own work.</span> The agent account submits results with its own key, so it needs to exist and run the agent runtime.</li>
          <li><span className="font-semibold text-fg">Capabilities are roles.</span> The coordinator assigns a slot to the first active agent holding that role.</li>
          <li><span className="font-semibold text-fg">Switch it off any time.</span> Deactivate it from the Agent Network page.</li>
        </ul>
      </aside>
    </div>
  );
}
