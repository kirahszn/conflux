# Conflux coordinator (Stage 3.2)

Off-chain service that watches the Conflux contract, stores task text whose
hash lives on-chain, and assigns slots to agents as the coordinator account.

## Setup
```
cp .env.example .env      # defaults point at v2.conflux-blessing.testnet
npm install
npm start                 # API on :8787 + watcher every 10s
npm run typecheck
```
The signing key is read from `~/.near-credentials/testnet/<COORDINATOR_ID>.json`
(NEAR CLI legacy keychain). It is never stored in `.env` or logged.

Node 22.22+ runs the `.ts` files directly (type stripping), so there is no build step.
SQLite uses the built-in `node:sqlite`; the DB file lives in `data/` (gitignored).

## API
| Method | Path | What it does |
|---|---|---|
| POST | `/tasks/:id/description` `{description}` | Stores it only if `sha256(description)` = on-chain `description_hash` |
| GET  | `/tasks/:id/slots/:slot/brief` | `{task_title, role, brief}` (role instruction + description) |
| POST | `/tasks/:id/slots/:slot/result` `{text, proof?}` | Stores it only if the slot is submitted on-chain, `sha256(text)` = `result_hash`, and the report passes the quality gate (`src/report.ts`). If `proof` = `{gather, write}` is sent: each part's signed hashes must equal sha256 of its `request_body` / `raw_response`, `text` must be the report inside the WRITE response, and the on-chain `proof_ref` must name the WRITE call (`src/proof.ts`). Signer recovery + attestation checks: later stage. |
| GET  | `/tasks/:id` | On-chain task merged with stored description, slot results and proofs |

Errors: 400 bad input or hash mismatch, 404 unknown task or slot, 409 not ready
(description missing, slot not submitted), 502 RPC error. No auth yet.

## Watcher
Every 10s: for `Funded` or `InProgress` tasks that are before their deadline,
have a stored description, and have unassigned slots, assign each unassigned
slot to the first active agent whose capabilities include the slot role.
Logs `ASSIGNED … tx=<hash>` or, once per slot, `NO MATCH …`. Transactions are
sent one at a time.
