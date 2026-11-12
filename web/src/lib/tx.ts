// Wallet transactions: build a FunctionCall to the Conflux contract, send it through the
// connected wallet, and turn the outcome into { txHash, value } or a readable contract error.
import { CONTRACT_ID, RPC_URL } from "./near";

export const TGAS = 1_000_000_000_000n;
export const ONE_YOCTO = "1";

export interface CallParams {
  methodName: string;
  args: Record<string, unknown>;
  /** yoctoNEAR as a decimal string */
  deposit: string;
  /** gas units as a decimal string */
  gas: string;
}

export type TxResult =
  | { ok: true; txHash: string | null; value: unknown }
  | { ok: false; txHash: string | null; error: string; rejected?: boolean };

/** Minimal shape of FinalExecutionOutcome that we read. */
interface Outcome {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
}

/** Decodes a base64 SuccessValue (the method's JSON return value). */
function decodeValue(b64: string | undefined): unknown {
  if (!b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Finds the human-readable reason inside a NEAR failure object, e.g. "Smart contract panicked: task not found". */
export function failureMessage(f: unknown): string {
  const seen: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") seen.push(x);
    else if (x && typeof x === "object") for (const v of Object.values(x)) walk(v);
  };
  walk(f);
  const panic = seen.find((s) => /panicked|ExecutionError|deposit|not|must|only/i.test(s));
  const raw = panic ?? JSON.stringify(f).slice(0, 300);
  return raw.replace(/^Smart contract panicked:\s*/, "Contract rejected it: ");
}

function fromOutcome(o: Outcome): TxResult | null {
  const txHash = o.transaction?.hash ?? o.transaction_outcome?.id ?? null;
  const st = o.status;
  if (st && typeof st === "object") {
    if ("Failure" in st && st.Failure) return { ok: false, txHash, error: failureMessage(st.Failure) };
    if ("SuccessValue" in st) return { ok: true, txHash, value: decodeValue(st.SuccessValue) };
  }
  return null;
}

/** Asks the RPC for the final status of a transaction (used when a wallet returns only the hash). */
async function txStatus(hash: string, sender: string): Promise<TxResult | null> {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "tx", method: "tx", params: { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" } }),
      });
      const j = await res.json();
      if (j.result) return fromOutcome(j.result as Outcome) ?? { ok: true, txHash: hash, value: null };
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** The part of a connected wallet we need. */
export interface SigningWallet {
  signAndSendTransaction(p: {
    signerId?: string;
    receiverId: string;
    actions: { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }[];
  }): Promise<unknown>;
}

/** Sends one FunctionCall to the Conflux contract from `signerId` and reports the real outcome. */
export async function callContract(wallet: SigningWallet, signerId: string, p: CallParams): Promise<TxResult> {
  let raw: unknown;
  try {
    raw = await wallet.signAndSendTransaction({
      signerId,
      receiverId: CONTRACT_ID,
      actions: [{ type: "FunctionCall", params: { methodName: p.methodName, args: p.args, gas: p.gas, deposit: p.deposit } }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
    const rejected = /reject|cancel|denied|closed|user/i.test(msg);
    return { ok: false, txHash: null, error: rejected ? "You rejected the transaction in the wallet." : failureMessage(e) || msg, rejected };
  }
  const o = (raw ?? {}) as Outcome;
  const direct = fromOutcome(o);
  if (direct) return direct;
  const hash = o.transaction?.hash ?? o.transaction_outcome?.id;
  if (hash) return (await txStatus(hash, signerId)) ?? { ok: true, txHash: hash, value: null };
  // Wallet returned nothing usable (e.g. redirect wallets): caller must confirm via contract state.
  return { ok: true, txHash: null, value: null };
}
