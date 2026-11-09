// View calls (anyone) and signed function calls as the coordinator.
import { Account, JsonRpcProvider, teraToGas } from "near-api-js";
import { config } from "./config.ts";

// ---- Contract types (mirror contract/src/lib.rs JSON) ----------------------
export type TaskStatus =
  | "Funded" | "InProgress" | "Submitted" | "Settled" | "Cancelled" | "Expired";

export interface Slot {
  role: string;
  reward: string;
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
  deadline: string; // ns, as a string (U64)
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
  registered_at: string;
  completed_contributions: number;
}

const provider = new JsonRpcProvider({ url: config.rpcUrl });
const coordinator = new Account(config.coordinatorId, provider, config.privateKey);

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId: config.contractId, method, args })) as T;
}

export const getTask = (id: number) => view<Task | null>("get_task", { task_id: id });

/** Pages through get_tasks / get_agents (contract caps a page at 50). */
async function all<T>(method: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 50) {
    const page = await view<T[]>(method, { from_index: from, limit: 50 });
    out.push(...page);
    if (page.length < 50) return out;
  }
}
export const getAllTasks = () => all<Task>("get_tasks");
export const getAllAgents = () => all<Agent>("get_agents");

// Signed calls go out one at a time so two calls never race for the same nonce.
let queue: Promise<unknown> = Promise.resolve();

/** Signs and sends a function call as the coordinator. Returns the tx hash; throws on failure. */
export function call(method: string, args: Record<string, unknown>): Promise<string> {
  const run = async () => {
    const res = await coordinator.callFunctionRaw({
      contractId: config.contractId,
      methodName: method,
      args,
      gas: teraToGas("30"),
      deposit: 0n,
    });
    const txHash = res.transaction_outcome.id;
    const status = res.status as Record<string, unknown>;
    if (status && typeof status === "object" && "Failure" in status) {
      throw new Error(`${method} failed (tx ${txHash}): ${JSON.stringify(status.Failure)}`);
    }
    return txHash;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}
