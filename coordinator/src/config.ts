// Loads settings from coordinator/.env and the coordinator's key from the
// NEAR CLI legacy keychain. The private key is never logged.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in coordinator/.env (see .env.example)`);
  return v;
}

const coordinatorId = required("COORDINATOR_ID");
const keyPath = join(homedir(), ".near-credentials", "testnet", `${coordinatorId}.json`);
if (!existsSync(keyPath)) throw new Error(`Key file not found: ${keyPath}`);
const keyFile = JSON.parse(readFileSync(keyPath, "utf8")) as { private_key?: string };
if (!keyFile.private_key?.startsWith("ed25519:")) {
  throw new Error(`No ed25519 private_key in ${keyPath}`);
}

export const config = {
  contractId: required("CONTRACT_ID"),
  coordinatorId,
  rpcUrl: required("NEAR_RPC_URL"),
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? "./data/coordinator.db",
  watchIntervalMs: Number(process.env.WATCH_INTERVAL_MS ?? 10_000),
  privateKey: keyFile.private_key as `ed25519:${string}`,
};
