// Writes src/data/task3.json: a static snapshot of task 3's real data for the deployed site,
// which cannot reach a coordinator running on a laptop. Run with the coordinator up:
//   node scripts/snapshot-task3.mts            (COORDINATOR_URL, default http://localhost:8787)
import { writeFileSync } from "node:fs";
import { buildShowcase, type AgentInput, type CoordPlanInput, type CoordTaskInput } from "../src/lib/showcase.ts";

const TASK_ID = 3;
const COORD = (process.env.COORDINATOR_URL ?? "http://localhost:8787").replace(/\/$/, "");
const RPC = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
const CONTRACT = "v2.conflux-blessing.testnet";

async function view<T>(method: string, args: object = {}): Promise<T> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "snap",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: CONTRACT, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error ?? j.result.error));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}
async function get(path: string): Promise<Response> {
  const r = await fetch(`${COORD}${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}

const [task, plan, report, agents, coordinator] = await Promise.all([
  get(`/tasks/${TASK_ID}`).then((r) => r.json() as Promise<CoordTaskInput>),
  get(`/tasks/${TASK_ID}/plan`).then((r) => r.json() as Promise<CoordPlanInput>),
  get(`/tasks/${TASK_ID}/report`).then((r) => r.text()),
  view<AgentInput[]>("get_agents", { from_index: 0, limit: 50 }),
  view<string>("get_coordinator"),
]);
const showcase = buildShowcase({ source: "snapshot", contractId: CONTRACT, coordinator, task, plan, report, agents });
const out = new URL("../src/data/task3.json", import.meta.url);
writeFileSync(out, JSON.stringify(showcase, null, 2) + "\n");
console.log(`wrote ${out.pathname}: ${showcase.contributions.length} contributions, ${showcase.synthesis.disagreements.length} disagreements, ${showcase.payouts.length} payouts`);
