// Browser-side verification of NEAR AI signatures and of the chain from signed response to the
// on-chain hash. No server is trusted: every check recomputes from raw bytes.
//
// NEAR AI signs `signed_text` with secp256k1 as an Ethereum personal message (EIP-191).
// signed_text = "<model>:<sha256(request)>:<sha256(response)>" (provider_tee) or
//               "<sha256(request)>:<sha256(response)>" (gateway).
// A result is "verified" only when every check passes. Pure module: no app imports, so the
// test script (scripts/verify-proofs.mts) can run it under plain Node.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export interface ProofPart {
  kind: string;
  signature: string;
  signed_text: string;
  signing_address: string;
  chat_id: string;
  model: string;
  request_body: string;
  raw_response: string;
}
export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
export interface Verification {
  ok: boolean;
  checks: Check[];
  /** first failed check, for the red badge */
  failed: Check | null;
  /** the signer addresses whose signatures were recovered and matched */
  signers: { step: string; kind: string; address: string }[];
  /** set when there is nothing complete to check (no proof stored, older format): grey, never green */
  unavailable?: string;
}

const enc = new TextEncoder();
export const sha256Hex = (s: string) => bytesToHex(sha256(enc.encode(s)));

/** Ethereum address that produced an EIP-191 signature over `text`. Throws on a malformed signature. */
export function recoverAddress(text: string, signatureHex: string): string {
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
  if (sig.length !== 65) throw new Error(`signature is ${sig.length} bytes, expected 65`);
  let v = sig[64]!;
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error(`bad recovery id ${sig[64]}`);
  const recovered = new Uint8Array(65);
  recovered[0] = v; // noble "recovered" format: [rec | r | s]
  recovered.set(sig.subarray(0, 64), 1);
  const msg = enc.encode(text);
  const digest = keccak_256(new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
  const pub = secp256k1.recoverPublicKey(recovered, digest, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  return "0x" + bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(12));
}

const short = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

/** Signature checks for one signed NEAR AI call. */
function partChecks(p: ProofPart, step: string): { checks: Check[]; signer: string | null } {
  const checks: Check[] = [];
  let signer: string | null = null;
  try {
    signer = recoverAddress(p.signed_text, p.signature);
  } catch (e) {
    checks.push({ label: `${step}: signature recovers to signing_address`, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
  if (signer !== null) {
    const ok = signer === p.signing_address.toLowerCase();
    checks.push({
      label: `${step}: signature recovers to signing_address`,
      ok,
      detail: ok ? `recovered ${signer}` : `recovered ${signer}, expected ${p.signing_address}`,
    });
  }
  const parts = p.signed_text.split(":");
  const req = sha256Hex(p.request_body);
  const res = sha256Hex(p.raw_response);
  checks.push({ label: `${step}: sha256(request_body) is the signed request hash`, ok: parts.at(-2) === req, detail: `sha256 ${short(req)}, signed ${short(parts.at(-2) ?? "none")}` });
  checks.push({ label: `${step}: sha256(raw_response) is the signed response hash`, ok: parts.at(-1) === res, detail: `sha256 ${short(res)}, signed ${short(parts.at(-1) ?? "none")}` });
  if (p.kind === "provider_tee") {
    checks.push({ label: `${step}: signed text names the model`, ok: p.signed_text.startsWith(`${p.model}:`), detail: p.model });
  }
  return { checks, signer: checks.every((c) => c.ok) ? signer : null };
}

function content(raw: string): string | null {
  try {
    const j = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

const unavailable = (reason: string): Verification => ({ ok: false, checks: [], failed: null, signers: [], unavailable: reason });

function finish(checks: Check[], signers: Verification["signers"]): Verification {
  const failed = checks.find((c) => !c.ok) ?? null;
  return { ok: checks.length > 0 && failed === null, checks, failed, signers: failed ? [] : signers };
}

// Same extraction rules as the coordinator (coordinator/src/report.ts, synthesis.ts).
const extractReport = (c: string) => {
  const m = /^# /m.exec(c);
  return m ? c.slice(m.index) : null;
};
const extractSynthesis = (c: string) => {
  const m = /^## Executive Summary[ \t]*$/m.exec(c);
  return m ? c.slice(m.index).trimEnd() : null;
};
/** Push markdown headings down by `levels` (as coordinator/src/synthesis.ts demote). */
function demote(md: string, levels: number): string {
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (inFence) return line;
      const m = /^(#{1,6})(\s.*)$/.exec(line);
      return m ? "#".repeat(Math.min(6, m[1]!.length + levels)) + m[2] : line;
    })
    .join("\n");
}

/** One agent contribution: report text + its proof, against what the contract stores for the slot. */
export function verifyContribution(
  onChain: { result_hash: string | null; proof_ref: string | null },
  result: string | null,
  proof: { gather?: ProofPart | null; write?: ProofPart } | null,
): Verification {
  const checks: Check[] = [];
  if (!onChain.result_hash) return unavailable("nothing submitted on chain");
  if (result === null) return unavailable("no report text stored by the coordinator");
  if (proof && !("write" in proof) && "signed_text" in proof) return unavailable("older single-step proof without the request body, cannot be fully checked");
  if (!proof?.write) return unavailable("no signed NEAR AI proof stored for this report");
  const w = proof.write;

  const h = sha256Hex(result);
  checks.push({ label: "sha256(report) equals the on-chain result_hash", ok: h === onChain.result_hash, detail: `sha256 ${short(h)}, on chain ${short(onChain.result_hash)}` });
  const inside = extractReport(content(w.raw_response) ?? "");
  checks.push({ label: "Report is exactly the text in the signed response", ok: inside === result, detail: inside === null ? "no report found in the signed response" : inside === result ? "identical" : "differs" });
  const ref = `nearai:${w.kind}:${w.model}:${w.chat_id}:${w.signing_address}`;
  checks.push({ label: "On-chain proof_ref names this signature", ok: onChain.proof_ref === ref, detail: onChain.proof_ref === ref ? `chat ${short(w.chat_id)}` : `on chain ${onChain.proof_ref ?? "none"}` });

  const signers: Verification["signers"] = [];
  const write = partChecks(w, "Writing step");
  checks.push(...write.checks);
  if (write.signer) signers.push({ step: "Writing step", kind: w.kind, address: write.signer });
  if (proof.gather) {
    const g = partChecks(proof.gather, "Search step");
    checks.push(...g.checks);
    if (g.signer) signers.push({ step: "Search step", kind: proof.gather.kind, address: g.signer });
  }
  return finish(checks, signers);
}

/** The coordinator's synthesis, against the final report and the on-chain final_report_hash. */
export function verifySynthesis(
  finalReportHash: string | null,
  report: string | null,
  synthesis: { synthesis: string; proof: ProofPart } | null,
): Verification {
  if (!finalReportHash) return unavailable("no final report hash on chain yet");
  if (report === null) return unavailable("final report not served by the coordinator");
  if (!synthesis) return unavailable("no signed synthesis served by the coordinator");
  const checks: Check[] = [];
  const h = sha256Hex(report);
  checks.push({ label: "sha256(final report) equals the on-chain final_report_hash", ok: h === finalReportHash, detail: `sha256 ${short(h)}, on chain ${short(finalReportHash)}` });
  const inside = extractSynthesis(content(synthesis.proof.raw_response) ?? "");
  checks.push({ label: "Synthesis is exactly the text in the signed response", ok: inside === synthesis.synthesis, detail: inside === null ? "no synthesis found in the signed response" : inside === synthesis.synthesis ? "identical" : "differs" });
  const inReport = report.includes(demote(synthesis.synthesis, 1));
  checks.push({ label: "Final report contains that synthesis", ok: inReport, detail: inReport ? "found" : "not found" });
  const s = partChecks(synthesis.proof, "Synthesis");
  checks.push(...s.checks);
  return finish(checks, s.signer ? [{ step: "Synthesis", kind: synthesis.proof.kind, address: s.signer }] : []);
}
