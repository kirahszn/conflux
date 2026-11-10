// Checks for an agent's result + NEAR AI proof (Stage 3.3, two-phase).
//   proof = { gather: Part | null, write: Part }  or  { kind: "dry_run", model }
// Proves: the text is the quality-gated report inside the signed WRITE response,
// each part's signature covers exactly its stored request + response bytes, and
// the on-chain proof_ref names the WRITE call. Cryptographic signer recovery and
// attestation checks come in a later stage.
import { sha256 } from "./hash.ts";
import { extractReport, qualityProblems } from "./report.ts";

export interface ProofPart {
  kind: "provider_tee" | "gateway";
  signature: string;
  signed_text: string;
  signing_address: string;
  chat_id: string;
  model: string;
  request_body: string;
  raw_response: string;
}
export type Proof = { gather: ProofPart | null; write: ProofPart } | { kind: "dry_run"; model: string };

const PART_FIELDS = [
  "kind", "signature", "signed_text", "signing_address", "chat_id", "model", "request_body", "raw_response",
] as const;

export const proofRefFor = (p: Proof) =>
  "kind" in p
    ? `dryrun:${p.model}`
    : `nearai:${p.write.kind}:${p.write.model}:${p.write.chat_id}:${p.write.signing_address}`;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function checkPart(input: unknown, name: string): Result<ProofPart> {
  if (typeof input !== "object" || input === null) return { ok: false, error: `proof.${name} must be an object` };
  const p = input as Record<string, unknown>;
  for (const f of PART_FIELDS) {
    if (typeof p[f] !== "string") return { ok: false, error: `proof.${name}.${f} must be a string` };
  }
  const part = Object.fromEntries(PART_FIELDS.map((f) => [f, p[f]])) as unknown as ProofPart;
  if (part.kind !== "provider_tee" && part.kind !== "gateway") {
    return { ok: false, error: `proof.${name}.kind must be provider_tee or gateway` };
  }
  // signed_text: "<model>:<req_hash>:<resp_hash>" (provider_tee) or "<req_hash>:<resp_hash>" (gateway)
  const hashes = part.signed_text.split(":");
  if (hashes.at(-1) !== sha256(part.raw_response)) {
    return { ok: false, error: `proof.${name}: sha256(raw_response) is not the signed response hash` };
  }
  if (hashes.at(-2) !== sha256(part.request_body)) {
    return { ok: false, error: `proof.${name}: sha256(request_body) is not the signed request hash` };
  }
  if (part.kind === "provider_tee" && !part.signed_text.startsWith(`${part.model}:`)) {
    return { ok: false, error: `proof.${name}: provider_tee signed_text does not start with the model id` };
  }
  return { ok: true, value: part };
}

/** Validates text + proof for a slot. `role` is the slot's on-chain role. */
export function checkResult(
  text: string,
  role: string,
  proofIn: unknown,
  onChainProofRef: string | null,
): Result<Proof | null> {
  // No proof: still apply the report quality gate (finish_reason can't be checked).
  if (proofIn === undefined || proofIn === null) {
    const problems = qualityProblems(text, role);
    return problems.length ? { ok: false, error: `quality gate: ${problems.join("; ")}` } : { ok: true, value: null };
  }
  if (typeof proofIn !== "object") return { ok: false, error: "proof must be an object" };
  const p = proofIn as Record<string, unknown>;

  let proof: Proof;
  if (p.kind === "dry_run") {
    if (typeof p.model !== "string") return { ok: false, error: "proof.model must be a string" };
    proof = { kind: "dry_run", model: p.model };
  } else {
    const write = checkPart(p.write, "write");
    if (!write.ok) return write;
    let gather: ProofPart | null = null;
    if (p.gather !== null && p.gather !== undefined) {
      const g = checkPart(p.gather, "gather");
      if (!g.ok) return g;
      gather = g.value;
    }
    proof = { gather, write: write.value };

    // The text must be exactly the report inside the signed WRITE response, and pass the gate.
    let content: string, finish: string | null;
    try {
      const j = JSON.parse(write.value.raw_response);
      content = j.choices?.[0]?.message?.content ?? "";
      finish = j.choices?.[0]?.finish_reason ?? null;
    } catch {
      return { ok: false, error: "proof.write.raw_response is not a JSON chat completion" };
    }
    if (extractReport(content) !== text) return { ok: false, error: "text is not the report in proof.write.raw_response" };
    const problems = qualityProblems(text, role, finish);
    if (problems.length) return { ok: false, error: `quality gate: ${problems.join("; ")}` };
  }

  const expectedRef = proofRefFor(proof);
  if (onChainProofRef !== expectedRef) {
    return { ok: false, error: `on-chain proof_ref ${JSON.stringify(onChainProofRef)} != ${JSON.stringify(expectedRef)}` };
  }
  return { ok: true, value: proof };
}
