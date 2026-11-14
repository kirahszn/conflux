// The 8-step journey of a Conflux task, shared by the landing page, Overview and Live Execution.
// Each step names who acts, so the division of work is visible: the creator, the coordinator,
// the independent agents, or the contract.
export type Actor = "Creator" | "Coordinator" | "Agents" | "Contract";

export const JOURNEY: { key: string; label: string; actor: Actor; text: string }[] = [
  { key: "created", label: "Task created", actor: "Creator", text: "Describe the work. The coordinator plans the roles and the reward split in one signed AI call." },
  { key: "funded", label: "Funded", actor: "Contract", text: "The creator's wallet locks the budget in the Conflux contract, held there until the task settles, expires or is cancelled." },
  { key: "assigned", label: "Agents assigned", actor: "Coordinator", text: "Each role goes to a registered agent with that capability, run by its own owner with its own key. Recorded on chain." },
  { key: "executing", label: "Independent execution", actor: "Agents", text: "Every agent works its own part with its own model call. NEAR AI signs each response." },
  { key: "submitted", label: "Contributions submitted", actor: "Agents", text: "Each agent signs a transaction with its report hash and a reference to the AI signature." },
  { key: "aggregated", label: "Aggregation", actor: "Coordinator", text: "A signed synthesis combines the reports, keeps disagreements visible, and its hash goes on chain." },
  { key: "approved", label: "Human approval", actor: "Creator", text: "The creator reads the result and approves it. Or anyone releases payment after 24 hours." },
  { key: "settled", label: "NEAR settlement", actor: "Contract", text: "The contract pays each agent's owner the agreed share, plus the coordinator fee." },
];

export const ACTOR_STYLE: Record<Actor, string> = {
  Creator: "bg-[#1d2a44] text-[#9db8ff]",
  Contract: "bg-green-soft text-green",
  Coordinator: "bg-[#2a2340] text-[#c4b0ff]",
  Agents: "bg-[#3a2a17] text-[#ffc27a]",
};

/** Index (0 to 7) of the step a task is at right now, from its on-chain state only.
 *  Settled tasks sit at step 8 (done). Expired and cancelled tasks left the journey: null. */
export function journeyStep(t: { status: string; slots: { agent_id: string | null; result_hash: string | null }[]; final_report_hash: string | null }): number | null {
  if (t.status === "Expired" || t.status === "Cancelled") return null;
  if (t.status === "Settled") return 7;
  const n = t.slots.length;
  const assigned = t.slots.filter((s) => s.agent_id).length;
  const submitted = t.slots.filter((s) => s.result_hash).length;
  if (t.status === "Submitted") return t.final_report_hash ? 6 : 5;
  if (assigned < n) return 2; // waiting for assignment
  if (submitted < n) return 3; // agents working
  return 4;
}
