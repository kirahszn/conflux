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

const putDesc = db.prepare("INSERT OR REPLACE INTO descriptions (task_id, text) VALUES (?, ?)");
const getDesc = db.prepare("SELECT text FROM descriptions WHERE task_id = ?");
const putRes = db.prepare("INSERT OR REPLACE INTO results (task_id, slot, text) VALUES (?, ?, ?)");
const getRes = db.prepare("SELECT slot, text FROM results WHERE task_id = ? ORDER BY slot");

export const store = {
  saveDescription: (taskId: number, text: string) => void putDesc.run(taskId, text),
  description: (taskId: number): string | undefined =>
    (getDesc.get(taskId) as { text: string } | undefined)?.text,
  saveResult: (taskId: number, slot: number, text: string) => void putRes.run(taskId, slot, text),
  results: (taskId: number): Map<number, string> =>
    new Map((getRes.all(taskId) as { slot: number; text: string }[]).map((r) => [r.slot, r.text])),
};
