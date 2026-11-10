// Shared NEAR AI Cloud client for coordinator calls (synthesis, planning):
// non-streamed chat completion + response signature checked against the exact bytes.
import { config } from "./config.ts";
import { sha256 } from "./hash.ts";
import type { ProofPart } from "./proof.ts";

const BASE = "https://cloud-api.near.ai/v1";

const headers = () => ({
  Authorization: `Bearer ${config.nearAiKey}`,
  "Content-Type": "application/json",
  "Accept-Encoding": "identity", // hash the exact bytes that were signed
  "x-no-aliasing": "true", // required for provider_tee signatures
});

export interface Completion {
  id: string;
  content: string;
  finish: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number };
  costUsd: number;
  requestBody: string;
  raw: string;
}

/** One non-streamed call, no tools, reasoning off. Stores raw bytes in `raws[label]` for failure dumps. */
export async function complete(
  label: string,
  system: string,
  user: string,
  maxTokens: number,
  raws: Record<string, string>,
): Promise<Completion> {
  const requestBody = JSON.stringify({
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    chat_template_kwargs: { thinking: false, enable_thinking: false },
  });
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: requestBody,
    signal: AbortSignal.timeout(180_000),
  });
  const raw = Buffer.from(await res.arrayBuffer()).toString("utf8");
  raws[label] = raw;
  if (res.status !== 200) throw new Error(`${label} HTTP ${res.status}: ${raw.slice(0, 300)}`);
  const j = JSON.parse(raw);
  const usage = j.usage ?? {};
  return {
    id: j.id,
    content: j.choices?.[0]?.message?.content ?? "",
    finish: j.choices?.[0]?.finish_reason ?? null,
    usage,
    costUsd: ((usage.prompt_tokens ?? 0) * config.priceInPerM + (usage.completion_tokens ?? 0) * config.priceOutPerM) / 1e6,
    requestBody,
    raw,
  };
}

/** Fetch the signature for a completion; require it to cover exactly our request + response bytes. */
export async function signed(c: Completion, requireKind?: "provider_tee" | "gateway"): Promise<ProofPart> {
  const url = `${BASE}/signature/${encodeURIComponent(c.id)}?model=${encodeURIComponent(config.model)}&signing_algo=ecdsa`;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`signature HTTP ${res.status}: ${body.slice(0, 200)}`);
    const s = JSON.parse(body);
    if (!s.signature || !s.signing_address || !s.text) throw new Error(`signature unavailable: ${body.slice(0, 200)}`);
    const parts = String(s.text).split(":");
    if (parts.at(-1) !== sha256(c.raw)) throw new Error("signature's response hash does not match the bytes received");
    if (parts.at(-2) !== sha256(c.requestBody)) throw new Error("signature's request hash does not match the bytes sent");
    if (requireKind && s.signature_kind !== requireKind) {
      throw new Error(`signature kind is ${s.signature_kind}, expected ${requireKind}`);
    }
    return {
      kind: s.signature_kind,
      signature: s.signature,
      signed_text: s.text,
      signing_address: s.signing_address,
      chat_id: c.id,
      model: config.model,
      request_body: c.requestBody,
      raw_response: c.raw,
    };
  }
  throw new Error("signature not available after 10 polls (404)");
}
