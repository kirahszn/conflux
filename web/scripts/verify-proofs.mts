// Checks src/lib/verify.ts against real proofs and tampered copies.
//   node scripts/verify-proofs.mts [coordinatorUrl] [taskIds]
// Reads on-chain tasks straight from the RPC and proofs from the coordinator. Exit 1 on any surprise.
import { network } from "../src/config/network.ts";
import { verifyContribution, verifySynthesis, type ProofPart, type Verification } from "../src/lib/verify.ts";

const coord = process.argv[2] ?? "http://localhost:8787";
const ids = (process.argv[3] ?? "2,3,5").split(",").map(Number);
let surprises = 0;

async function onChainTask(id: number) {
  const r = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: network.contractId, method_name: "get_task", args_base64: btoa(JSON.stringify({ task_id: id })) } }),
  });
  const j = await r.json();
  return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}

function expect(name: string, v: Verification, want: boolean, wantFailLabel?: RegExp) {
  const good = v.ok === want && (!wantFailLabel || (v.failed && wantFailLabel.test(v.failed.label)));
  if (!good) surprises++;
  console.log(`${good ? "ok  " : "FAIL"} ${name}: ${v.ok ? `verified (${v.checks.length} checks)` : v.unavailable ? `not checked: ${v.unavailable}` : `failed: ${v.failed?.label} (${v.failed?.detail})`}`);
}

type Slot = { result: string | null; proof: { gather?: ProofPart | null; write?: ProofPart } | null };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

for (const id of ids) {
  const chain = await onChainTask(id);
  const t = (await (await fetch(`${coord}/tasks/${id}`)).json()) as { slots: Slot[] };
  const report = await (await fetch(`${coord}/tasks/${id}/report`)).text();
  const synth = (await (await fetch(`${coord}/tasks/${id}/synthesis`)).json()) as { synthesis: string; proof: ProofPart };

  t.slots.forEach((s, i) => expect(`task ${id} slot ${i} (${chain.slots[i].role})`, verifyContribution(chain.slots[i], s.result, s.proof), true));
  expect(`task ${id} synthesis`, verifySynthesis(chain.final_report_hash, report, synth), true);

  if (id !== ids.at(-1)) continue;
  // ---- tampered copies (must all fail, at the right check) ----
  const s0 = t.slots[0]!;
  const c0 = chain.slots[0];
  const tamper = (f: (s: Slot) => void) => {
    const s = clone(s0);
    f(s);
    return s;
  };
  const flip = (hex: string) => hex.slice(0, 10) + (hex[10] === "a" ? "b" : "a") + hex.slice(11);
  let x = tamper((s) => (s.result = s.result!.replace("NEAR", "N3AR")));
  expect("tampered: report text edited", verifyContribution(c0, x.result, x.proof), false, /result_hash/);
  x = tamper((s) => (s.proof!.write!.raw_response = s.proof!.write!.raw_response.replace("NEAR", "N3AR")));
  expect("tampered: signed response edited", verifyContribution(c0, x.result, x.proof), false, /signed response|response hash/);
  x = tamper((s) => (s.proof!.write!.signature = flip(s.proof!.write!.signature)));
  expect("tampered: signature byte changed", verifyContribution(c0, x.result, x.proof), false, /recovers to signing_address/);
  x = tamper((s) => (s.proof!.write!.signing_address = "0x" + "1".repeat(40)));
  expect("tampered: signing_address swapped", verifyContribution(c0, x.result, x.proof), false, /proof_ref|recovers/);
  x = tamper((s) => (s.proof!.write!.request_body = s.proof!.write!.request_body.replace("Agent", "Agnt")));
  expect("tampered: request body edited", verifyContribution(c0, x.result, x.proof), false, /request hash/);
  x = tamper((s) => (s.proof!.gather!.signature = flip(s.proof!.gather!.signature)));
  expect("tampered: search-step signature changed", verifyContribution(c0, x.result, x.proof), false, /Search step/);
  expect("tampered: wrong slot's proof", verifyContribution(c0, s0.result, t.slots[1]!.proof), false);
  expect("tampered: final report edited", verifySynthesis(chain.final_report_hash, report.replace("NEAR", "N3AR"), synth), false, /final_report_hash/);
  const sx = clone(synth);
  sx.proof.signature = flip(sx.proof.signature);
  expect("tampered: synthesis signature changed", verifySynthesis(chain.final_report_hash, report, sx), false, /recovers/);
  const sy = clone(synth);
  sy.synthesis = sy.synthesis.replace("NEAR", "N3AR");
  expect("tampered: synthesis text edited", verifySynthesis(chain.final_report_hash, report, sy), false, /Synthesis is exactly/);
  const miss = verifyContribution(c0, s0.result, null);
  expect("missing proof (grey, not verified)", miss, false);
  if (!miss.unavailable) { surprises++; console.log("FAIL missing proof should be marked unavailable"); }
}
// Task 1 predates the two-step proof (no request body): must be "not checked", never verified.
{
  const chain1 = await onChainTask(1);
  const t1 = (await (await fetch(`${coord}/tasks/1`)).json()) as { slots: Slot[] };
  const v = verifyContribution(chain1.slots[0], t1.slots[0]!.result, t1.slots[0]!.proof);
  expect("task 1 slot 0 (older proof format)", v, false);
  if (!v.unavailable?.includes("older")) { surprises++; console.log("FAIL task 1 should be marked as an older format"); }
}
console.log(surprises ? `${surprises} SURPRISE(S)` : "ALL AS EXPECTED");
process.exit(surprises ? 1 : 0);
