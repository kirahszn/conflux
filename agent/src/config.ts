// Per-agent settings. Every value can come from environment variables (Railway);
// agent/.env.<name>, the repo-root .env and ~/.near-credentials are local-dev fallbacks.
//
// Agent name: first CLI arg, else AGENT_NAME. Prefixed variables win over plain ones:
// for name "research", RESEARCH_AGENT_ID overrides AGENT_ID, RESEARCH_AGENT_PRIVATE_KEY
// overrides AGENT_PRIVATE_KEY, etc. Keys are never logged — only where they came from.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertAccountsOnNetwork, NETWORK, NETWORK_DEFAULTS } from "./network.ts";

const AGENT_DIR = join(import.meta.dirname, "..");
const name = process.argv[2] ?? process.env.AGENT_NAME;
if (!name || !/^[a-z0-9_-]+$/.test(name)) {
  throw new Error("Agent name missing: npm start -- <name>  (or set AGENT_NAME), e.g. research");
}
// testnet: agent/.env.<name>   mainnet: agent/.env.mainnet.<name> (testnet files are never read on mainnet).
const envFile = join(AGENT_DIR, NETWORK === "mainnet" ? `.env.mainnet.${name}` : `.env.${name}`);
const envFileUsed = existsSync(envFile);
if (envFileUsed) process.loadEnvFile(envFile); // never overrides variables already set

// Apply <NAME>_X → X (prefixed wins).
export const envPrefix = `${name.toUpperCase().replace(/-/g, "_")}_`;
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith(envPrefix) && v !== undefined) process.env[k.slice(envPrefix.length)] = v;
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key} for agent "${name}" (set ${envPrefix}${key} or ${key}; see DEPLOY.md)`);
  return v;
}
const bool = (key: string, dflt: boolean) => {
  const v = (process.env[key] ?? String(dflt)).toLowerCase();
  if (v !== "true" && v !== "false") throw new Error(`${key} must be true or false`);
  return v === "true";
};

const agentId = required("AGENT_ID");
const contractId = required("CONTRACT_ID");
assertAccountsOnNetwork({ AGENT_ID: agentId, CONTRACT_ID: contractId });

/** AGENT_PRIVATE_KEY (or <NAME>_AGENT_PRIVATE_KEY), else the NEAR CLI legacy keychain file. */
function loadKey(): { key: `ed25519:${string}`; source: string } {
  const fromEnv = process.env.AGENT_PRIVATE_KEY?.trim();
  if (fromEnv) {
    if (!fromEnv.startsWith("ed25519:")) throw new Error("AGENT_PRIVATE_KEY must start with ed25519:");
    const src = process.env[`${envPrefix}AGENT_PRIVATE_KEY`] ? `${envPrefix}AGENT_PRIVATE_KEY` : "AGENT_PRIVATE_KEY";
    return { key: fromEnv as `ed25519:${string}`, source: `env ${src}` };
  }
  const keyPath = join(homedir(), ".near-credentials", NETWORK, `${agentId}.json`);
  if (!existsSync(keyPath)) throw new Error(`No ${envPrefix}AGENT_PRIVATE_KEY env var and no key file at ${keyPath}`);
  const k = (JSON.parse(readFileSync(keyPath, "utf8")) as { private_key?: string }).private_key;
  if (!k?.startsWith("ed25519:")) throw new Error(`No ed25519 private_key in ${keyPath}`);
  return { key: k as `ed25519:${string}`, source: `file ${keyPath}` };
}

/** NEARAI_API_KEY env var, else the repo-root .env (local dev). */
function loadNearAiKey(): { key: string; source: string } {
  const fromEnv = process.env.NEARAI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "env NEARAI_API_KEY" };
  const rootEnv = join(AGENT_DIR, "..", ".env");
  const k = existsSync(rootEnv)
    ? readFileSync(rootEnv, "utf8").match(/^NEARAI_API_KEY=["']?([^"'\r\n]+)/m)?.[1]
    : undefined;
  return k ? { key: k, source: `file ${rootEnv}` } : { key: "", source: "MISSING" };
}

const dryRun = bool("DRY_RUN", false);
const key = loadKey();
const ai = loadNearAiKey();
if (!dryRun && !ai.key) throw new Error("NEARAI_API_KEY is not set (env var or repo-root .env)");

const role = process.env.ROLE ?? name;
const promptPath = join(AGENT_DIR, "prompts", `${role}.md`);
if (!existsSync(promptPath)) throw new Error(`Missing role prompt ${promptPath}`);
/** DATA_DIR, else the Railway volume mount, else agent/state (testnet) or agent/state-mainnet (mainnet) */
const dataDir = process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? join(AGENT_DIR, NETWORK === "mainnet" ? "state-mainnet" : "state");

export const config = {
  name,
  network: NETWORK,
  agentId,
  role,
  contractId,
  coordinatorUrl: required("COORDINATOR_URL").replace(/\/$/, ""),
  rpcUrl: process.env.NEAR_RPC_URL ?? NETWORK_DEFAULTS.rpcUrl,
  model: process.env.MODEL ?? "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  gatherMaxTokens: Number(process.env.GATHER_MAX_TOKENS ?? 1500),
  writeMaxTokens: Number(process.env.WRITE_MAX_TOKENS ?? 3000),
  webSearch: bool("WEB_SEARCH", true),
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
  stateFile: join(dataDir, `${agentId}.json`),
  systemPrompt: readFileSync(promptPath, "utf8"),
  privateKey: key.key,
  keySource: key.source,
  nearAiKey: ai.key,
  nearAiKeySource: ai.source,
  envFile: envFileUsed ? envFile : null,
};
