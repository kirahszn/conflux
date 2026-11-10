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

// NEAR AI key for the SYNTHESIS call: repo-root .env (never logged).
const rootEnv = join(import.meta.dirname, "..", "..", ".env");
const nearAiKey = existsSync(rootEnv)
  ? readFileSync(rootEnv, "utf8").match(/^NEARAI_API_KEY=["']?([^"'\r\n]+)/m)?.[1]
  : undefined;

export const config = {
  contractId: required("CONTRACT_ID"),
  coordinatorId,
  rpcUrl: required("NEAR_RPC_URL"),
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? "./data/coordinator.db",
  watchIntervalMs: Number(process.env.WATCH_INTERVAL_MS ?? 10_000),
  privateKey: keyFile.private_key as `ed25519:${string}`,
  // Stage 3.4 synthesis
  nearAiKey: nearAiKey ?? "",
  model: process.env.MODEL ?? "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  synthMaxTokens: Number(process.env.SYNTH_MAX_TOKENS ?? 3000),
  synthSpendLimitUsd: Number(process.env.SYNTH_SPEND_LIMIT_USD ?? 0.03),
  planSpendLimitUsd: Number(process.env.PLAN_SPEND_LIMIT_USD ?? 0.02),
  priceInPerM: Number(process.env.PRICE_IN_PER_M ?? 0.3),
  priceOutPerM: Number(process.env.PRICE_OUT_PER_M ?? 1.2),
};
