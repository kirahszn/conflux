# Deploying the Conflux backend to Railway

Two Railway services from this one repo. Each has a `Dockerfile` in its folder; Railway
always builds from a Dockerfile when it finds one, which also pins Node to 22.23.4
(near-api-js needs ≥ 22.22.2). No build step: Node runs the TypeScript directly.

> Railway's `railway.json` / `railway.toml` ("Config as Code") is deprecated and stops
> being read on 2026-12-01, so these services are configured with Dockerfiles plus the
> service settings below.

Testnet only. Values are never committed — set them in Railway's service Variables.

## Service 1: `coordinator`

**Settings:** Root Directory `/coordinator` · Healthcheck Path `/health` ·
generate a public domain (the website calls this service) · add a **Volume**
mounted at e.g. `/data` (the SQLite file lives there).

| Variable | Required | Notes |
|---|---|---|
| `CONTRACT_ID` | yes | e.g. the live v2 contract |
| `COORDINATOR_ID` | yes | the coordinator account |
| `COORDINATOR_PRIVATE_KEY` | yes | `ed25519:…` full-access key of `COORDINATOR_ID` (secret) |
| `NEARAI_API_KEY` | yes | NEAR AI Cloud key, for planning + synthesis (secret) |
| `WEBSITE_ORIGIN` | no | CORS: `*` (default) or comma-separated origins, e.g. the website URL |
| `PORT` | no | set by Railway; local default 8787 |
| `DATA_DIR` | no | defaults to `RAILWAY_VOLUME_MOUNT_PATH`, else `./data` |
| `DB_PATH` | no | overrides `DATA_DIR/coordinator.db` |
| `NEAR_RPC_URL` | no | default `https://test.rpc.fastnear.com` |
| `WATCH_INTERVAL_MS` | no | default 10000 |
| `MODEL` | no | default `deepseek-ai/DeepSeek-V4.1-Flash-1017` |
| `SYNTH_MAX_TOKENS` | no | default 3000 |
| `SYNTH_SPEND_LIMIT_USD` | no | default 0.03 (estimated, all synthesis calls) |
| `PLAN_SPEND_LIMIT_USD` | no | default 0.02 (estimated, all planning calls) |
| `PRICE_IN_PER_M`, `PRICE_OUT_PER_M` | no | USD per 1M tokens for spend estimates (DeepSeek defaults) |

`GET /health` → `{ ok, contract_id, coordinator_id, watcher: { last_tick_at, last_tick_ok, last_error, ticks } }`.

## Service 2: `agents`

**Settings:** Root Directory `/agent` · no public domain needed · add a **Volume**
mounted at e.g. `/data` (one JSON state file per agent: attempts + spend).
The container runs `node src/launcher.ts`, which starts every agent in `AGENTS` as its
own child process, restarts crashed ones with backoff, and prefixes logs with `[research]` etc.

**Shared** (used by every agent unless a prefixed version is set):

| Variable | Required | Notes |
|---|---|---|
| `CONTRACT_ID` | yes | same contract as the coordinator |
| `COORDINATOR_URL` | yes | the coordinator's URL (Railway private or public domain) |
| `NEARAI_API_KEY` | yes | NEAR AI Cloud key (secret) |
| `AGENTS` | no | default `research,security,market` |
| `DATA_DIR` | no | defaults to `RAILWAY_VOLUME_MOUNT_PATH`, else `agent/state` |
| `NEAR_RPC_URL` | no | default `https://test.rpc.fastnear.com` |
| `MODEL` | no | default `deepseek-ai/DeepSeek-V4.1-Flash-1017` (backup `Qwen/Qwen3.8-27B`) |
| `WEB_SEARCH` | no | default `true` |
| `GATHER_MAX_TOKENS`, `WRITE_MAX_TOKENS` | no | defaults 1500 / 3000 |
| `SPEND_LIMIT_USD` | no | default 0.05 per agent (estimated) |
| `SKIP_TASK_IDS` | no | comma-separated task ids to ignore |
| `POLL_INTERVAL_MS` | no | default 10000 |
| `DRY_RUN` | no | default `false`; `true` = placeholder answers, dev only |
| `PRICE_IN_PER_M`, `PRICE_OUT_PER_M`, `SEARCH_PRICE` | no | spend-estimate prices |

**Per agent** — prefix with `RESEARCH_`, `SECURITY_`, `MARKET_` (one set per name in `AGENTS`).
Each child process only receives its own prefixed variables.

| Variable | Required | Notes |
|---|---|---|
| `<NAME>_AGENT_ID` | yes | e.g. the agent's sub-account |
| `<NAME>_AGENT_PRIVATE_KEY` | yes | `ed25519:…` full-access key of that agent account (secret) |
| `<NAME>_ROLE` | no | defaults to the name (must match `prompts/<role>.md`) |
| `<NAME>_<any shared var>` | no | per-agent override, e.g. `MARKET_WEB_SEARCH`, `SECURITY_SPEND_LIMIT_USD` |

## Local development
Without these variables everything falls back to the local files used so far:
`coordinator/.env`, `agent/.env.<name>`, the repo-root `.env` (NEAR AI key) and
`~/.near-credentials/testnet/<account>.json`. Each process logs where its keys came from
(never the keys themselves).
