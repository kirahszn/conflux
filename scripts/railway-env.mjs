// Prints the Railway variables for the MAINNET coordinator and agents services, filled in from
// this laptop's NEAR CLI keychain (~/.near-credentials/mainnet) and the repo-root .env (NEAR AI key).
// Paste each block into Railway: service -> Variables -> Raw Editor.
// The output contains PRIVATE KEYS. Do not commit it, screenshot it or share it anywhere else.
//
//   node scripts/railway-env.mjs [https://coordinator-domain.up.railway.app]
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRED = join(homedir(), ".near-credentials", "mainnet");
const CONTRACT = "conflux.bestnode934.near";
const COORDINATOR = "coordinator.bestnode934.near";
const AGENTS = { research: "agent.research.bestnode934.near", security: "agent.security.bestnode934.near", market: "agent.market.bestnode934.near" };
const coordUrl = process.argv[2] ?? "https://PASTE-COORDINATOR-DOMAIN-HERE";

function key(account) {
  const f = join(CRED, `${account}.json`);
  if (!existsSync(f)) throw new Error(`Missing key file ${f}`);
  const k = JSON.parse(readFileSync(f, "utf8")).private_key;
  if (!k?.startsWith("ed25519:")) throw new Error(`No ed25519 private_key in ${f}`);
  return k;
}
const envFile = join(ROOT, ".env");
const ai = existsSync(envFile) ? readFileSync(envFile, "utf8").match(/^NEARAI_API_KEY=["']?([^"'\r\n]+)/m)?.[1] : undefined;
if (!ai) throw new Error(`NEARAI_API_KEY not found in ${envFile}`);

const coordinator = [
  "NEAR_NETWORK=mainnet",
  `CONTRACT_ID=${CONTRACT}`,
  `COORDINATOR_ID=${COORDINATOR}`,
  `COORDINATOR_PRIVATE_KEY=${key(COORDINATOR)}`,
  `NEARAI_API_KEY=${ai}`,
  "WEBSITE_ORIGIN=*",
  "SYNTH_SPEND_LIMIT_USD=0.05",
  "PLAN_SPEND_LIMIT_USD=0.02",
];
const agents = [
  "NEAR_NETWORK=mainnet",
  `CONTRACT_ID=${CONTRACT}`,
  `COORDINATOR_URL=${coordUrl}`,
  `NEARAI_API_KEY=${ai}`,
  `AGENTS=${Object.keys(AGENTS).join(",")}`,
  "SPEND_LIMIT_USD=0.20",
  ...Object.entries(AGENTS).flatMap(([name, id]) => [
    `${name.toUpperCase()}_AGENT_ID=${id}`,
    `${name.toUpperCase()}_AGENT_PRIVATE_KEY=${key(id)}`,
    `${name.toUpperCase()}_ROLE=${name}`,
  ]),
];

console.log("\n===== 1. COORDINATOR service: Variables -> Raw Editor =====\n");
console.log(coordinator.join("\n"));
console.log("\n===== 2. AGENTS service: Variables -> Raw Editor =====\n");
console.log(agents.join("\n"));
if (!process.argv[2]) console.log("\n(Run again with the coordinator's Railway URL to fill COORDINATOR_URL.)");
console.log("\nThese lines contain private keys. Paste them only into Railway.\n");
