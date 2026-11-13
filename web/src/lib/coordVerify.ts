"use client";
// Fetches a task's raw proofs from the coordinator, verifies them in the browser (lib/verify.ts)
// against the on-chain task, then keeps only the slim view and the verification results.
// Cached per on-chain fingerprint, so Live Execution, Contributions and the detail page share one
// fetch per task state. The coordinator is only a byte store here: nothing it says is trusted.
import type { CoordProofPart, CoordTask } from "./live";
import { COORDINATOR_URL, type Task } from "./near";
import { verifyContribution, type ProofPart, type Verification } from "./verify";

export interface TaskProofs {
  slim: CoordTask;
  /** per slot: null when the slot has no submission on chain */
  slots: (Verification | null)[];
}

export const fingerprintOf = (t: Task) =>
  `${t.id}|${t.status}|${t.slots.map((s) => s.result_hash ?? "-").join(",")}|${t.final_report_hash ?? "-"}`;

const cache = new Map<string, Promise<TaskProofs>>();
export const coordGet = (path: string) => fetch(`${COORDINATOR_URL}${path}`, { signal: AbortSignal.timeout(20_000) });

type RawSlot = { result: string | null; proof: unknown };

export function loadTaskProofs(task: Task): Promise<TaskProofs> {
  const key = fingerprintOf(task);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const r = await coordGet(`/tasks/${task.id}`);
    if (!r.ok) throw new Error(`GET /tasks/${task.id}: HTTP ${r.status}`);
    const raw = (await r.json()) as Omit<CoordTask, "slots"> & { slots: RawSlot[] };
    const slots = task.slots.map((s, i) => {
      if (!s.result_hash) return null;
      const rs = raw.slots[i];
      // Two-step proofs ({gather, write}) are checked; anything else is passed through so verify.ts can say why not.
      const proof = rs?.proof && typeof rs.proof === "object" ? (rs.proof as { gather?: ProofPart | null; write?: ProofPart }) : null;
      return verifyContribution(s, rs?.result ?? null, proof);
    });
    // Keep only what the pages show; the raw request/response bodies are dropped here.
    const slim: CoordTask = {
      description: raw.description,
      final_report: raw.final_report,
      slots: raw.slots.map((s) => ({
        result: s.result,
        proof:
          s.proof && typeof s.proof === "object" && "write" in s.proof
            ? { gather: pick((s.proof as { gather?: CoordProofPart | null }).gather ?? null), write: pick((s.proof as { write: CoordProofPart }).write) }
            : (s.proof as CoordTask["slots"][number]["proof"]),
      })),
    };
    return { slim, slots };
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key)); // a failed fetch is retried next time
  return p;
}

function pick(p: CoordProofPart | null | undefined): CoordProofPart | undefined {
  return p ? { kind: p.kind, model: p.model, chat_id: p.chat_id, signing_address: p.signing_address } : undefined;
}
