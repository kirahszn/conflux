// Read-only access to the Conflux contract via plain NEAR JSON-RPC (no SDK needed).
// Network values come from src/config/network.ts (the single network config).
import { explorer, network } from "@/config/network";

export { explorer, network };
export const NETWORK = network.networkId;
/** "" when the contract is not configured for this network (the layout then shows a "not configured" screen). */
export const CONTRACT_ID = network.contractId ?? "";
export const RPC_URL = network.rpcUrl;
/** null when this network has no coordinator; coordinator views treat that as offline. */
export const COORDINATOR_URL = network.coordinatorUrl;

// ---- Contract types (mirror contract/src/lib.rs JSON) ----------------------
export type TaskStatus = "Funded" | "InProgress" | "Submitted" | "Settled" | "Cancelled" | "Expired";
export interface Slot {
  role: string;
  reward: string; // yoctoNEAR
  agent_id: string | null;
  result_hash: string | null;
  proof_ref: string | null;
  submitted_at: string | null;
}
export interface Task {
  id: number;
  creator: string;
  title: string;
  description_hash: string;
  slots: Slot[];
  coordinator_fee: string;
  escrow: string;
  status: TaskStatus;
  created_at: string;
  deadline: string;
  submitted_at: string | null;
  final_report_hash: string | null;
}
export interface Agent {
  agent_id: string;
  owner: string;
  name: string;
  description: string;
  capabilities: string[];
  active: boolean;
  registered_at: string; // ns
  completed_contributions: number;
}

export class RpcError extends Error {}

export async function view<T>(method: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!CONTRACT_ID) throw new RpcError(`No Conflux contract is configured for ${network.label}.`);
  let res: Response;
  try {
    res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: signal ?? AbortSignal.timeout(15_000),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "conflux",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: CONTRACT_ID,
          method_name: method,
          args_base64: btoa(JSON.stringify(args)),
        },
      }),
    });
  } catch (e) {
    throw new RpcError(`Could not reach the NEAR RPC (${e instanceof Error ? e.message : "network error"})`);
  }
  if (!res.ok) throw new RpcError(`NEAR RPC returned HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new RpcError(json.error.data ?? json.error.message ?? "NEAR RPC error");
  if (json.result?.error) throw new RpcError(String(json.result.error));
  const bytes = new Uint8Array(json.result.result as number[]);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** Reads every page of get_agents / get_tasks (the contract caps a page at 50). */
async function all<T>(method: string, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 50) {
    const page = await view<T[]>(method, { from_index: from, limit: 50 }, signal);
    out.push(...page);
    if (page.length < 50) return out;
  }
}
export const getAllAgents = (signal?: AbortSignal) => all<Agent>("get_agents", signal);
export const getAllTasks = (signal?: AbortSignal) => all<Task>("get_tasks", signal);
export const getCoordinator = (signal?: AbortSignal) => view<string>("get_coordinator", {}, signal);

// ---- Money -----------------------------------------------------------------
const YOCTO = 10n ** 24n;

/** yoctoNEAR → "1.2345" (trailing zeros trimmed). */
export function formatNear(yocto: bigint | string, maxDecimals = 4): string {
  const y = BigInt(yocto);
  const whole = y / YOCTO;
  const frac = (y % YOCTO).toString().padStart(24, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/**
 * NEAR paid out by the contract, following its payout rules:
 * - Settled task: every slot reward goes to its agent's owner, plus the fee to the coordinator (= escrow).
 * - Expired task: only submitted slots are paid; the rest is refunded to the creator (not counted).
 * Earnings per agent are keyed by agent_id.
 */
export function payouts(tasks: Task[]) {
  let total = 0n;
  const byAgent = new Map<string, bigint>();
  const credit = (agent: string | null, amount: bigint) => {
    if (!agent) return;
    byAgent.set(agent, (byAgent.get(agent) ?? 0n) + amount);
  };
  for (const t of tasks) {
    if (t.status === "Settled") {
      total += BigInt(t.escrow);
      for (const s of t.slots) credit(s.agent_id, BigInt(s.reward));
    } else if (t.status === "Expired") {
      for (const s of t.slots) {
        if (s.result_hash) {
          total += BigInt(s.reward);
          credit(s.agent_id, BigInt(s.reward));
        }
      }
    }
  }
  return { total, byAgent };
}

/** Total budget of a task: every slot reward plus the coordinator fee. */
export const taskBudget = (t: Task) => t.slots.reduce((sum, s) => sum + BigInt(s.reward), BigInt(t.coordinator_fee));

/** ns timestamp string → Date */
export const nsToDate = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n));
