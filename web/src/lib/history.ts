"use client";
// Which transaction settled a task, and which one carried a submission. The contract does not store
// transaction hashes, so we list the contract's transactions from NearBlocks and confirm each
// candidate by reading its real arguments from the archival RPC. Nothing is guessed: if a match
// cannot be confirmed, callers show "not found" and link the contract on the explorer instead.
//
// NearBlocks' free tier allows about 10 calls a minute, so the list and the decoded arguments are
// cached in localStorage (final transactions never change) and only the newest page is refetched.
import { network } from "@/config/network";
import type { Task } from "./near";

export interface ChainTx {
  hash: string;
  signer: string;
  method: string | null;
  /** block timestamp, ns */
  ts: string;
  ok: boolean;
}
export interface FoundTx extends ChainTx {
  args: Record<string, unknown>;
}

const contract = network.contractId ?? "";
const LIST_KEY = `conflux.txs.${network.networkId}.${contract}`;
const ARGS_KEY = `conflux.txargs.${network.networkId}`;
const REFRESH_MS = 60_000;
const MAX_PAGES = 20;

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the cache is only a convenience */
  }
}

type NbTx = {
  transaction_hash: string;
  signer_account_id: string;
  block_timestamp: string;
  actions?: { method?: string | null }[];
  outcomes?: { status?: boolean | null };
};

async function nearblocks(next: string | null): Promise<{ txs: ChainTx[]; next: string | null }> {
  const url = `${network.explorerApiUrl}/v3/accounts/${contract}/txns?per_page=25${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = (await r.json().catch(() => null)) as { data?: NbTx[]; meta?: { next_page?: string }; message?: string } | null;
  if (r.status === 429 || /request limit/i.test(body?.message ?? "")) throw new Error("NearBlocks rate limit reached. Try again in a minute.");
  if (!r.ok || !body?.data) throw new Error(`NearBlocks: ${body?.message ?? `HTTP ${r.status}`}`);
  return {
    txs: body.data.map((t) => ({
      hash: t.transaction_hash,
      signer: t.signer_account_id,
      method: t.actions?.[0]?.method ?? null,
      ts: t.block_timestamp,
      ok: t.outcomes?.status === true,
    })),
    next: body.meta?.next_page ?? null,
  };
}

let inflight: Promise<ChainTx[]> | null = null;

/** Every transaction sent to the contract, newest first (cached; refetches only new ones). */
export function contractTxs(): Promise<ChainTx[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cache = readLS<{ at: number; txs: ChainTx[]; complete: boolean }>(LIST_KEY, { at: 0, txs: [], complete: false });
    if (cache.complete && Date.now() - cache.at < REFRESH_MS) return cache.txs;
    const known = new Set(cache.txs.map((t) => t.hash));
    const fresh: ChainTx[] = [];
    let next: string | null = null;
    let reachedKnown = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await nearblocks(next);
      for (const t of res.txs) {
        if (known.has(t.hash)) reachedKnown = true;
        else fresh.push(t);
      }
      next = res.next;
      if ((reachedKnown && cache.complete) || !next || res.txs.length === 0) break;
    }
    const txs = [...fresh, ...cache.txs.filter((t) => !fresh.some((f) => f.hash === t.hash))].sort((a, b) => (BigInt(b.ts) > BigInt(a.ts) ? 1 : -1));
    writeLS(LIST_KEY, { at: Date.now(), txs, complete: cache.complete || !next || reachedKnown });
    return txs;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The function-call arguments a transaction really carried, read from the archival RPC (cached). */
export async function txArgs(tx: ChainTx): Promise<Record<string, unknown>> {
  const cache = readLS<Record<string, Record<string, unknown>>>(ARGS_KEY, {});
  if (cache[tx.hash]) return cache[tx.hash]!;
  const r = await fetch(network.archivalRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: "tx", method: "tx", params: { tx_hash: tx.hash, sender_account_id: tx.signer, wait_until: "NONE" } }),
  });
  const j = await r.json();
  const action = j.result?.transaction?.actions?.[0]?.FunctionCall;
  if (!action) throw new Error(`Archival RPC: ${JSON.stringify(j.error?.cause ?? j.error ?? "no function call").slice(0, 120)}`);
  const args = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(action.args), (c) => c.charCodeAt(0)))) as Record<string, unknown>;
  writeLS(ARGS_KEY, { ...readLS<Record<string, unknown>>(ARGS_KEY, {}), [tx.hash]: args });
  return args;
}

const CLOSING: Record<string, string[]> = {
  Settled: ["approve_task", "release_payment"],
  Expired: ["expire_task"],
  Cancelled: ["cancel_task"],
};

/** task id → the successful transaction that closed it (approve, release, expire or cancel). */
export async function closingTxs(tasks: Task[]): Promise<Map<number, FoundTx>> {
  const closed = tasks.filter((t) => CLOSING[t.status]);
  const out = new Map<number, FoundTx>();
  if (closed.length === 0) return out;
  const txs = (await contractTxs()).filter((t) => t.ok && t.method && Object.values(CLOSING).flat().includes(t.method));
  for (const tx of txs) {
    if (out.size === closed.length) break;
    const args = await txArgs(tx);
    const task = closed.find((t) => t.id === Number(args.task_id));
    if (task && CLOSING[task.status]!.includes(tx.method!) && !out.has(task.id)) out.set(task.id, { ...tx, args });
  }
  return out;
}

/** The successful submit_contribution transaction for one slot (signed by its agent). */
export async function submissionTx(task: Task, slotIndex: number): Promise<FoundTx | null> {
  const s = task.slots[slotIndex];
  if (!s?.agent_id || !s.submitted_at) return null;
  const at = BigInt(s.submitted_at);
  const window = 120n * 1_000_000_000n; // the receipt runs in the same or a following block
  const candidates = (await contractTxs()).filter(
    (t) => t.ok && t.method === "submit_contribution" && t.signer === s.agent_id && BigInt(t.ts) <= at && at - BigInt(t.ts) <= window,
  );
  for (const tx of candidates) {
    const args = await txArgs(tx);
    if (Number(args.task_id) === task.id && Number(args.slot_index) === slotIndex && args.result_hash === s.result_hash) return { ...tx, args };
  }
  return null;
}
