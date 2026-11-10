// NEAR AI Cloud, two phases per slot:
//   GATHER — streamed, web search on, facts list with URLs   (signature: gateway)
//   WRITE  — non-streamed, no tools, writes the report        (signature: provider_tee)
// Exact request + response bytes are kept so anyone can re-check the signed hashes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { extractReport, qualityProblems } from "./report.ts";
import { retry, sha256, sleep } from "./util.ts";

const BASE = "https://cloud-api.near.ai/v1";
const GATHER_PROMPT = readFileSync(join(import.meta.dirname, "..", "prompts", "gather.md"), "utf8");
const MAX_FACTS_CHARS = 24_000;

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

export interface Answer {
  text: string;
  proof: Proof;
}

/** Collects raw bytes and spend while a pipeline runs, so failures can be saved/billed. */
export interface Trace {
  raws: Record<string, string>;
  addCost: (usd: number, label: string) => void;
}

export const proofRefFor = (p: Proof) =>
  "kind" in p
    ? `dryrun:${p.model}`
    : `nearai:${p.write.kind}:${p.write.model}:${p.write.chat_id}:${p.write.signing_address}`;

const headers = () => ({
  Authorization: `Bearer ${config.nearAiKey}`,
  "Content-Type": "application/json",
  "Accept-Encoding": "identity", // hash the exact bytes that were signed
  "x-no-aliasing": "true", // required for provider_tee signatures
});

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}
const costOf = (u: Usage | null, searches: number) =>
  ((u?.prompt_tokens ?? 0) * config.priceInPerM + (u?.completion_tokens ?? 0) * config.priceOutPerM) / 1e6 +
  searches * config.searchPrice;

async function post(body: Record<string, unknown>) {
  const requestBody = JSON.stringify(body);
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: requestBody,
    signal: AbortSignal.timeout(180_000),
  });
  const raw = Buffer.from(await res.arrayBuffer()).toString("utf8");
  return { requestBody, raw, status: res.status };
}

export async function answer(brief: string, trace: Trace, log: (m: string) => void): Promise<Answer> {
  if (config.dryRun) return dryRun(brief);

  const gathered = config.webSearch ? await gather(brief, trace, log) : null;
  if (!gathered) log("GATHER skipped (WEB_SEARCH=false) — WRITE gets no gathered facts");

  // ---- 2. WRITE ----------------------------------------------------------
  const w = await post({
    model: config.model,
    messages: [
      { role: "system", content: config.systemPrompt },
      {
        role: "user",
        content: gathered
          ? `${brief}\n\n---\nGathered facts (from a separate web-search step). ` +
            `Use only these facts and cite their URLs:\n\n${gathered.facts}`
          : `${brief}\n\n---\nNo web search was available. Mark anything you cannot support as Unknown.`,
      },
    ],
    max_tokens: config.writeMaxTokens,
    chat_template_kwargs: { thinking: false, enable_thinking: false },
  });
  trace.raws.write = w.raw;
  if (w.status !== 200) throw new Error(`WRITE HTTP ${w.status}: ${w.raw.slice(0, 300)}`);
  const wj = JSON.parse(w.raw);
  const wCost = costOf(wj.usage, 0);
  trace.addCost(wCost, "write");
  const content: string = wj.choices?.[0]?.message?.content ?? "";
  const finish: string | null = wj.choices?.[0]?.finish_reason ?? null;
  log(`WRITE ${content.length} chars, finish=${finish}, usage=${JSON.stringify(wj.usage)}, ~$${wCost.toFixed(4)}`);

  const report = extractReport(content);
  if (report === null) throw new Error("WRITE: no '# ' heading in the answer");
  const problems = qualityProblems(report, config.role, finish);
  if (problems.length) throw new Error(`quality gate failed: ${problems.join("; ")}`);

  const writeProof = await signed(wj.id, w.requestBody, w.raw);
  if (writeProof.kind !== "provider_tee") log(`WARNING: WRITE signature kind is ${writeProof.kind}, expected provider_tee`);
  return { text: report, proof: { gather: gathered?.proof ?? null, write: writeProof } };
}

/** GATHER: streamed call with web search; returns a facts list (or raw results) + its proof. */
async function gather(brief: string, trace: Trace, log: (m: string) => void) {
  const g = await post({
    model: config.model,
    messages: [
      { role: "system", content: GATHER_PROMPT },
      { role: "user", content: brief },
    ],
    max_tokens: config.gatherMaxTokens,
    chat_template_kwargs: { thinking: false, enable_thinking: false },
    tools: [{ type: "web_context_search" }],
    stream: true,
    stream_options: { include_usage: true },
  });
  trace.raws.gather = g.raw;
  if (g.status !== 200) throw new Error(`GATHER HTTP ${g.status}: ${g.raw.slice(0, 300)}`);
  let gId = "", gText = "", gUsage: Usage | null = null, searches = 0;
  const toolOutputs: string[] = [];
  for (const line of g.raw.split("\n")) {
    if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
    const c = JSON.parse(line.slice(6));
    if (c.error) throw new Error(`GATHER stream error: ${JSON.stringify(c.error).slice(0, 300)}`);
    gId ||= c.id ?? "";
    gUsage = c.usage ?? gUsage;
    const d = c.choices?.[0]?.delta ?? {};
    gText += d.content ?? "";
    if (d.nearai_tool_result) {
      searches++;
      const r = d.nearai_tool_result;
      toolOutputs.push(typeof r === "string" ? r : String(r.output ?? JSON.stringify(r)));
    }
  }
  // No usage chunk → assume a large prompt so the spend cap stays conservative.
  const gCost = costOf(gUsage ?? { prompt_tokens: 30_000, completion_tokens: config.gatherMaxTokens }, searches);
  trace.addCost(gCost, "gather");
  log(`GATHER ${searches} search(es), ${gText.length} chars of facts, usage=${JSON.stringify(gUsage)}, ~$${gCost.toFixed(4)}`);
  if (!gId) throw new Error("GATHER: no chat id");

  // Facts = the model's list if it has URLs; else (it searched but never wrote the
  // list) the raw search results, which are inside the same signed response.
  let facts: string;
  if (/https?:\/\//.test(gText)) facts = gText.trim();
  else if (toolOutputs.length) {
    facts = toolOutputs.join("\n\n").slice(0, MAX_FACTS_CHARS);
    log(`GATHER wrote no facts list — using the ${toolOutputs.length} raw search result(s) instead`);
  } else throw new Error(`GATHER produced no facts and no search results: ${JSON.stringify(gText.slice(0, 200))}`);
  return { facts, proof: await signed(gId, g.requestBody, g.raw) };
}

/** Fetch the signature and check it covers exactly our request + response bytes. */
async function signed(chatId: string, requestBody: string, raw: string): Promise<ProofPart> {
  const s = await retry("fetch signature", () => fetchSignature(chatId), 3);
  const parts = s.text.split(":");
  if (parts.at(-1) !== sha256(raw)) throw new Error("signature's response hash does not match the bytes received");
  if (!parts.includes(sha256(requestBody))) throw new Error("signature's request hash does not match the bytes sent");
  return {
    kind: s.signature_kind,
    signature: s.signature,
    signed_text: s.text,
    signing_address: s.signing_address,
    chat_id: chatId,
    model: config.model,
    request_body: requestBody,
    raw_response: raw,
  };
}

interface SignatureResponse {
  text: string;
  signature: string;
  signing_address: string;
  signature_kind: "provider_tee" | "gateway";
}

/** GET /v1/signature/{chat_id}; 404 means "not ready yet" — poll briefly. */
async function fetchSignature(chatId: string): Promise<SignatureResponse> {
  const url = `${BASE}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(config.model)}&signing_algo=ecdsa`;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(30_000) });
    const body = await res.text();
    if (res.status === 404) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) throw new Error(`signature HTTP ${res.status}: ${body.slice(0, 200)}`);
    const j = JSON.parse(body);
    if (!j.signature || !j.signing_address || !j.text) throw new Error(`signature unavailable: ${body.slice(0, 200)}`);
    if (j.signature_kind !== "provider_tee" && j.signature_kind !== "gateway") {
      throw new Error(`unexpected signature_kind ${j.signature_kind}`);
    }
    return j as SignatureResponse;
  }
  throw new Error("signature not available after 10 polls (404)");
}

function dryRun(brief: string): Answer {
  const text =
    `# [DRY RUN — placeholder, no AI call was made]\n\n` +
    `This is NOT a real ${config.role} report. DRY_RUN=true is for development only.\n\n` +
    `Brief received (${brief.length} chars).\n`;
  return { text, proof: { kind: "dry_run", model: config.model } };
}
