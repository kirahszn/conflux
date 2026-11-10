// Local per-agent state: never repeat work, cap attempts, track estimated AI spend.
// Written atomically (temp file + rename).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.ts";
import type { Proof } from "./nearai.ts";

export interface SlotState {
  stage: "pending" | "answered" | "submitted" | "posted" | "failed";
  attempts: number;
  text?: string;
  result_hash?: string;
  proof?: Proof;
  proof_ref?: string;
  submit_tx?: string;
  last_error?: string;
  updated_at: string;
}
interface State {
  spent_usd: number;
  slots: Record<string, SlotState>; // key "taskId:slot"
}

mkdirSync(dirname(config.stateFile), { recursive: true });
const loaded = existsSync(config.stateFile) ? JSON.parse(readFileSync(config.stateFile, "utf8")) : null;
// Files from the first 3.3 test had slots at the top level: wrap them.
const state: State =
  loaded === null
    ? { spent_usd: 0, slots: {} }
    : "slots" in loaded
      ? loaded
      : { spent_usd: 0, slots: Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, { attempts: 1, ...(v as object) }])) };

function save() {
  const tmp = `${config.stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, config.stateFile);
}

export const key = (taskId: number, slot: number) => `${taskId}:${slot}`;
export const get = (k: string): SlotState | undefined => state.slots[k];
export function set(k: string, patch: Partial<SlotState>) {
  const prev = state.slots[k] ?? { attempts: 0, stage: "pending" as const };
  state.slots[k] = { ...prev, ...patch, updated_at: new Date().toISOString() };
  save();
}
export const spent = () => state.spent_usd;
export function addSpend(usd: number) {
  state.spent_usd += usd;
  save();
}

/** Save raw AI responses from a failed attempt for later inspection. */
export function saveFailure(k: string, attempt: number, raws: Record<string, string>, error: string) {
  const dir = join(dirname(config.stateFile), "failures");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${config.role}-${k.replace(":", "-")}-attempt${attempt}`);
  writeFileSync(`${base}-error.txt`, error + "\n");
  for (const [phase, raw] of Object.entries(raws)) writeFileSync(`${base}-${phase}.raw`, raw);
  return base;
}
