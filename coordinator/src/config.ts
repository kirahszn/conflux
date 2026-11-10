// Coordinator settings. Every value can come from environment variables (Railway);
// coordinator/.env and ~/.near-credentials are local-dev fallbacks only.
// Private keys and API keys are never logged — only where they came from.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (set it as an environment variable; see DEPLOY.md / .env.example)`);
  return v;
}

const coordinatorId = required("COORDINATOR_ID");

/** COORDINATOR_PRIVATE_KEY env var, else the NEAR CLI legacy keychain file. */
function loadKey(): { key: `ed25519:${string}`; source: string } {
  const fromEnv = process.env.COORDINATOR_PRIVATE_KEY?.trim();
  if (fromEnv) {
    if (!fromEnv.startsWith("ed25519:")) throw new Error("COORDINATOR_PRIVATE_KEY must start with ed25519:");
    return { key: fromEnv as `ed25519:${string}`, source: "env COORDINATOR_PRIVATE_KEY" };
  }
  const keyPath = join(homedir(), ".near-credentials", "testnet", `${coordinatorId}.json`);
  if (!existsSync(keyPath)) throw new Error(`No COORDINATOR_PRIVATE_KEY env var and no key file at ${keyPath}`);
  const k = (JSON.parse(readFileSync(keyPath, "utf8")) as { private_key?: string }).private_key;
  if (!k?.startsWith("ed25519:")) throw new Error(`No ed25519 private_key in ${keyPath}`);
  return { key: k as `ed25519:${string}`, source: `file ${keyPath}` };
}

/** NEARAI_API_KEY env var, else the repo-root .env (local dev). */
function loadNearAiKey(): { key: string; source: string } {
  const fromEnv = process.env.NEARAI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env NEARAI_API_KEY" };
  const rootEnv = join(import.meta.dirname, "..", "..", ".env");
  const k = existsSync(rootEnv)
    ? readFileSync(rootEnv, "utf8").match(/^NEARAI_API_KEY=["']?([^"'\r\n]+)/m)?.[1]
    : undefined;
  return k ? { key: k, source: `file ${rootEnv}` } : { key: "", source: "MISSING (planning/synthesis will fail)" };
}

const coordKey = loadKey();
const aiKey = loadNearAiKey();
/** DATA_DIR, else the Railway volume mount, else ./data */
const dataDir = process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "./data";

export const config = {
  contractId: required("CONTRACT_ID"),
  coordinatorId,
  rpcUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  port: Number(process.env.PORT ?? 8787),
  dataDir,
  dbPath: process.env.DB_PATH ?? join(dataDir, "coordinator.db"),
  watchIntervalMs: Number(process.env.WATCH_INTERVAL_MS ?? 10_000),
  /** Comma-separated allowed origins for CORS; "*" = any. */
  websiteOrigin: process.env.WEBSITE_ORIGIN ?? "*",
  privateKey: coordKey.key,
  keySource: coordKey.source,
  // Stage 3.4 synthesis / 3.5 planning
  nearAiKey: aiKey.key,
  nearAiKeySource: aiKey.source,
  model: process.env.MODEL ?? "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  synthMaxTokens: Number(process.env.SYNTH_MAX_TOKENS ?? 3000),
  synthSpendLimitUsd: Number(process.env.SYNTH_SPEND_LIMIT_USD ?? 0.03),
  planSpendLimitUsd: Number(process.env.PLAN_SPEND_LIMIT_USD ?? 0.02),
  priceInPerM: Number(process.env.PRICE_IN_PER_M ?? 0.3),
  priceOutPerM: Number(process.env.PRICE_OUT_PER_M ?? 1.2),
};
