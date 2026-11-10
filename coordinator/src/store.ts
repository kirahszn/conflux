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

export const store = {
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
