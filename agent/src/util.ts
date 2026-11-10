import { createHash } from "node:crypto";
import { config } from "./config.ts";

/** Lowercase hex SHA-256 of UTF-8 text — the contract's hash format. */
export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const log = (msg: string) => console.log(`${new Date().toISOString()} [agent:${config.role}] ${msg}`);
export const logErr = (msg: string) => console.error(`${new Date().toISOString()} [agent:${config.role}] ERROR ${msg}`);

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs fn up to `attempts` times with 2s, 4s, 8s… delays. Logs every failure. */
export async function retry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw new Error(`${label} failed after ${attempts} attempts: ${errMsg(e)}`);
      const wait = 2000 * 2 ** (i - 1);
      logErr(`${label} attempt ${i}/${attempts} failed: ${errMsg(e)} — retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}
