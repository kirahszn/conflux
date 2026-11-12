// Typed calls to the coordinator API used by the New task flow. Errors carry the coordinator's own message.
import { COORDINATOR_URL } from "./near";

export interface PlanSlot {
  role: string;
  reason: string;
  reward: string; // yocto
  reward_near: string;
  brief: string;
  agents: string[];
}
export interface Plan {
  title: string;
  description: string;
  description_hash: string;
  budget: string; // yocto
  coordinator_fee: string; // yocto
  slots: PlanSlot[];
  fixes: string[];
  create_task: {
    contract_id: string;
    method: "create_task";
    args: { title: string; description_hash: string; slots: { role: string; reward: string }[]; coordinator_fee: string; deadline: string };
    attached_deposit: string; // budget + 0.05 NEAR storage allowance (excess refunded by the contract)
    deadline_iso: string;
  };
  proof: { kind: string; model: string; chat_id: string; signing_address: string };
  created_at: string;
}

export class CoordinatorError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!COORDINATOR_URL) throw new CoordinatorError("No coordinator is configured for this network.", null);
  let res: Response;
  try {
    res = await fetch(`${COORDINATOR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new CoordinatorError(`Could not reach the coordinator (${e instanceof Error ? e.message : "network error"}).`, null);
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) throw new CoordinatorError(`${j.error ?? `HTTP ${res.status}`}${j.detail ? `: ${j.detail}` : ""}`, res.status);
  return j as T;
}

/** One NEAR AI planning call (signed in a TEE). Can take 10 to 60 seconds. */
export const postPlan = (b: { title: string; description: string; budget_near: string; deadline_hours: number }) => post<Plan>("/plan", b, 120_000);

/** Stores the description; the coordinator checks sha256(description) against the on-chain hash and links the plan. */
export const postDescription = (taskId: number, description: string) =>
  post<{ ok: true; task_id: number; description_hash: string; plan_linked: boolean }>(`/tasks/${taskId}/description`, { description }, 20_000);
