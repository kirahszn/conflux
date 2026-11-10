# Conflux agent runtime (Stage 3.3)

One codebase, run as independent processes — one per agent:
```
npm install
cp .env.example .env.research   # edit AGENT_ID / ROLE; repeat for .env.security, .env.market
npm start -- research           # loads agent/.env.research
npm run typecheck
```
- NEAR AI key: `NEARAI_API_KEY` in the repo-root `.env` (never logged).
- NEAR key: `~/.near-credentials/testnet/<AGENT_ID>.json` — each agent signs its own transactions.
- State: `state/<AGENT_ID>.json` (gitignored) — slot progress, attempts, estimated spend.
  Raw AI responses of failed attempts go to `state/failures/`.

## Loop (every 10s)
For each slot assigned to `AGENT_ID` on an `InProgress` task, not yet submitted, before its deadline:
1. `GET /tasks/:id/slots/:slot/brief` from the coordinator.
2. **GATHER** — streamed NEAR AI call with `web_context_search` (prompt: at most 2 searches, facts list
   with URLs). Signature kind `gateway`. Skipped if `WEB_SEARCH=false`.
3. **WRITE** — non-streamed call, no tools, `max_tokens` 3000, reasoning off; writes the report from the
   brief + gathered facts. Signature kind `provider_tee` (signed inside the model's TEE).
4. **Quality gate** (`src/report.ts`, same copy in the coordinator): starts with `# <Role> Report`, has every
   required `##` heading, ≥ 1,000 chars, `finish_reason=stop`, a URL under `## Sources`. Text before the
   first `# ` line is dropped.
5. `submit_contribution(task_id, slot, sha256(report), proof_ref)` signed by the agent, where
   `proof_ref = nearai:<provider_tee|gateway>:<model>:<write chat_id>:<write signing_address>`.
6. `POST /tasks/:id/slots/:slot/result` with `{text, proof: {gather, write}}`; each proof part has
   `kind, signature, signed_text, signing_address, chat_id, model, request_body, raw_response`.

The answer is saved to the state file before submitting, so a crash never causes a second AI call or a
different text. "slot already submitted" is accepted only if the on-chain hash equals ours.

## Limits
- At most **2 AI attempts per slot**, persisted; then `GIVING UP` (no further AI calls for that slot).
- `SPEND_LIMIT_USD` (default 0.05) per agent, estimated from token usage + list prices + $0.005/search;
  an attempt is not started if it could exceed the limit.
- `SKIP_TASK_IDS` — comma-separated task ids to ignore.
- `DRY_RUN=true` — no AI call; submits a clearly labelled placeholder (dev only).

## Roles
`prompts/<role>.md` (WRITE system prompt) and `prompts/gather.md` (GATHER). Roles with fixed sections:
research (`## What It Does`), security (`## Audits and Incidents`), market (`## Market Position and Token`).
