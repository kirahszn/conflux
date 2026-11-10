// Per-agent settings: agent/.env.<name> (name = first CLI arg), NEAR AI key from
// the repo-root .env, NEAR key from the NEAR CLI legacy keychain. Keys are never logged.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = join(import.meta.dirname, "..");
const name = process.argv[2];
if (!name || !/^[a-z0-9_-]+$/.test(name)) {
  throw new Error("Usage: npm start -- <name>   (loads agent/.env.<name>, e.g. research)");
}
const envFile = join(AGENT_DIR, `.env.${name}`);
if (!existsSync(envFile)) throw new Error(`Missing ${envFile} (copy .env.example)`);
process.loadEnvFile(envFile);

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} in ${envFile}`);
  return v;
}
const bool = (key: string) => {
  const v = required(key).toLowerCase();
  if (v !== "true" && v !== "false") throw new Error(`${key} must be true or false`);
  return v === "true";
};

const agentId = required("AGENT_ID");
const keyPath = join(homedir(), ".near-credentials", "testnet", `${agentId}.json`);
if (!existsSync(keyPath)) throw new Error(`Key file not found: ${keyPath}`);
const privateKey = (JSON.parse(readFileSync(keyPath, "utf8")) as { private_key?: string }).private_key;
if (!privateKey?.startsWith("ed25519:")) throw new Error(`No ed25519 private_key in ${keyPath}`);

const dryRun = bool("DRY_RUN");
const rootEnv = join(AGENT_DIR, "..", ".env");
const nearAiKey = existsSync(rootEnv)
  ? readFileSync(rootEnv, "utf8").match(/^NEARAI_API_KEY=["']?([^"'\r\n]+)/m)?.[1]
  : undefined;
if (!dryRun && !nearAiKey) throw new Error(`NEARAI_API_KEY not found in ${rootEnv}`);

const role = required("ROLE");
const promptPath = join(AGENT_DIR, "prompts", `${role}.md`);
if (!existsSync(promptPath)) throw new Error(`Missing role prompt ${promptPath}`);

export const config = {
  name,
  agentId,
  role,
  contractId: required("CONTRACT_ID"),
  coordinatorUrl: required("COORDINATOR_URL").replace(/\/$/, ""),
  rpcUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  model: required("MODEL"),
  gatherMaxTokens: Number(process.env.GATHER_MAX_TOKENS ?? 1500),
  writeMaxTokens: Number(process.env.WRITE_MAX_TOKENS ?? 3000),
  webSearch: bool("WEB_SEARCH"),
  /** Estimated-spend cap for this agent (USD). Prices default to DeepSeek V4.1 Flash list prices. */
  spendLimitUsd: Number(process.env.SPEND_LIMIT_USD ?? 0.05),
  priceInPerM: Number(process.env.PRICE_IN_PER_M ?? 0.3),
  priceOutPerM: Number(process.env.PRICE_OUT_PER_M ?? 1.2),
  searchPrice: Number(process.env.SEARCH_PRICE ?? 0.005),
  skipTaskIds: new Set(
    (process.env.SKIP_TASK_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number),
  ),
  dryRun,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  stateFile: join(AGENT_DIR, "state", `${agentId}.json`),
  systemPrompt: readFileSync(promptPath, "utf8"),
  privateKey: privateKey as `ed25519:${string}`,
  nearAiKey: nearAiKey ?? "",
};
