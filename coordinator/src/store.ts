// Local SQLite store for off-chain text whose hash lives on-chain.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.ts";

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS descriptions (
    task_id    INTEGER PRIMARY KEY,
    text       TEXT NOT NULL,
    stored_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS results (
    task_id    INTEGER NOT NULL,
    slot       INTEGER NOT NULL,
    text       TEXT NOT NULL,
    stored_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, slot)
  );
`);
// Stage 3.4: final reports (one per task) + coordinator spend.
db.exec(`
  CREATE TABLE IF NOT EXISTS final_reports (
    task_id      INTEGER PRIMARY KEY,
    status       TEXT NOT NULL,          -- pending | ready | set | failed
    attempts     INTEGER NOT NULL DEFAULT 0,
    report       TEXT,
    report_hash  TEXT,
    synthesis    TEXT,
    proof        TEXT,
    tx           TEXT,
    last_error   TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- Stage 3.5: AI plans by description_hash, and which task uses which plan.
  CREATE TABLE IF NOT EXISTS plans (
    description_hash TEXT PRIMARY KEY,
    plan             TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS plan_links (
    task_id          INTEGER PRIMARY KEY,
    description_hash TEXT NOT NULL
  );
`);
// A linked task keeps its own copy of the plan, so a later POST /plan for the same
// description (same hash) can't change the briefs of an existing task.
const linkCols = db.prepare("PRAGMA table_info(plan_links)").all() as { name: string }[];
if (!linkCols.some((c) => c.name === "plan")) {
  db.exec("ALTER TABLE plan_links ADD COLUMN plan TEXT");
  db.exec("UPDATE plan_links SET plan = (SELECT plan FROM plans WHERE plans.description_hash = plan_links.description_hash) WHERE plan IS NULL");
}
// Stage 3.3: proof JSON per result. Add the column to databases created in 3.2.
const resultCols = db.prepare("PRAGMA table_info(results)").all() as { name: string }[];
if (!resultCols.some((c) => c.name === "proof")) db.exec("ALTER TABLE results ADD COLUMN proof TEXT");

const putDesc = db.prepare("INSERT OR REPLACE INTO descriptions (task_id, text) VALUES (?, ?)");
const getDesc = db.prepare("SELECT text FROM descriptions WHERE task_id = ?");
const putRes = db.prepare(
  "INSERT OR REPLACE INTO results (task_id, slot, text, proof) VALUES (?, ?, ?, ?)",
);
const getRes = db.prepare("SELECT slot, text, proof FROM results WHERE task_id = ? ORDER BY slot");

export interface StoredResult {
  text: string;
  proof: unknown | null;
}

export interface FinalReportRow {
  task_id: number;
  status: "pending" | "ready" | "set" | "failed";
  attempts: number;
  report: string | null;
  report_hash: string | null;
  synthesis: string | null;
  proof: unknown | null;
  tx: string | null;
  last_error: string | null;
  updated_at: string;
}
const getFinal = db.prepare("SELECT * FROM final_reports WHERE task_id = ?");
const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
const putMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");

export const store = {
  finalReport(taskId: number): FinalReportRow | undefined {
    const r = getFinal.get(taskId) as (Omit<FinalReportRow, "proof"> & { proof: string | null }) | undefined;
    return r && { ...r, proof: r.proof === null ? null : JSON.parse(r.proof) };
  },
  /** Insert or update a final-report row (only the given fields change). */
  setFinalReport(taskId: number, patch: Partial<Omit<FinalReportRow, "task_id" | "updated_at">>) {
    const cur = store.finalReport(taskId);
    const row = { status: "pending", attempts: 0, report: null, report_hash: null, synthesis: null, proof: null, tx: null, last_error: null, ...cur, ...patch };
    db.prepare(
      `INSERT OR REPLACE INTO final_reports (task_id, status, attempts, report, report_hash, synthesis, proof, tx, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(taskId, row.status, row.attempts, row.report, row.report_hash, row.synthesis,
      row.proof === null ? null : JSON.stringify(row.proof), row.tx, row.last_error);
  },
  savePlan: (hash: string, plan: unknown) =>
    void db.prepare("INSERT OR REPLACE INTO plans (description_hash, plan) VALUES (?, ?)").run(hash, JSON.stringify(plan)),
  plan: (hash: string): unknown | undefined => {
    const r = db.prepare("SELECT plan FROM plans WHERE description_hash = ?").get(hash) as { plan: string } | undefined;
    return r && JSON.parse(r.plan);
  },
  linkPlan: (taskId: number, hash: string, plan: unknown) =>
    void db
      .prepare("INSERT OR REPLACE INTO plan_links (task_id, description_hash, plan) VALUES (?, ?, ?)")
      .run(taskId, hash, JSON.stringify(plan)),
  linkedPlan: (taskId: number): unknown | undefined => {
    const r = db.prepare("SELECT plan FROM plan_links WHERE task_id = ?").get(taskId) as { plan: string | null } | undefined;
    return r?.plan ? JSON.parse(r.plan) : undefined;
  },
  planSpent: (): number => Number((getMeta.get("plan_spent_usd") as { value: string } | undefined)?.value ?? 0),
  addPlanSpend: (usd: number) => void putMeta.run("plan_spent_usd", String(store.planSpent() + usd)),
  synthSpent: (): number => Number((getMeta.get("synth_spent_usd") as { value: string } | undefined)?.value ?? 0),
  addSynthSpend: (usd: number) => void putMeta.run("synth_spent_usd", String(store.synthSpent() + usd)),

  saveDescription: (taskId: number, text: string) => void putDesc.run(taskId, text),
  description: (taskId: number): string | undefined =>
    (getDesc.get(taskId) as { text: string } | undefined)?.text,
  saveResult: (taskId: number, slot: number, text: string, proof: unknown | null) =>
    void putRes.run(taskId, slot, text, proof === null ? null : JSON.stringify(proof)),
  results: (taskId: number): Map<number, StoredResult> =>
    new Map(
      (getRes.all(taskId) as { slot: number; text: string; proof: string | null }[]).map((r) => [
        r.slot,
        { text: r.text, proof: r.proof === null ? null : JSON.parse(r.proof) },
      ]),
    ),
};
