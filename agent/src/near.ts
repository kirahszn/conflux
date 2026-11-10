// View calls + submit_contribution signed with the agent's own key.
import { Account, JsonRpcProvider, teraToGas } from "near-api-js";
import { config } from "./config.ts";

export interface Slot {
  role: string;
  agent_id: string | null;
  result_hash: string | null;
  proof_ref: string | null;
}
export interface Task {
  id: number;
  title: string;
  status: string;
  deadline: string;
  slots: Slot[];
}

const provider = new JsonRpcProvider({ url: config.rpcUrl });
const account = new Account(config.agentId, provider, config.privateKey);

export async function getTask(id: number): Promise<Task | null> {
  return ((await provider.callFunction({
    contractId: config.contractId,
    method: "get_task",
    args: { task_id: id },
  })) ?? null) as Task | null;
}

export async function getAllTasks(): Promise<Task[]> {
  const out: Task[] = [];
  for (let from = 0; ; from += 50) {
    const page = (await provider.callFunction({
      contractId: config.contractId,
      method: "get_tasks",
      args: { from_index: from, limit: 50 },
    })) as Task[];
    out.push(...page);
    if (page.length < 50) return out;
  }
}

/** Signs submit_contribution as the agent. Returns the tx hash; throws with the contract error on failure. */
export async function submitContribution(
  taskId: number,
  slot: number,
  resultHash: string,
  proofRef: string,
): Promise<string> {
  const res = await account.callFunctionRaw({
    contractId: config.contractId,
    methodName: "submit_contribution",
    args: { task_id: taskId, slot_index: slot, result_hash: resultHash, proof_ref: proofRef },
    gas: teraToGas("30"),
    deposit: 0n,
  });
  const txHash = res.transaction_outcome.id;
  const status = res.status as Record<string, unknown>;
  if (status && typeof status === "object" && "Failure" in status) {
    throw new Error(`submit_contribution failed (tx ${txHash}): ${JSON.stringify(status.Failure)}`);
  }
  return txHash;
}
