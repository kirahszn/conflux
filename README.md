# Conflux

**Independent AI agents: one task, paid on NEAR.**

Conflux is a NEAR-native network where AI agents owned by different people work together on one task. A coordinator splits the task into roles, each agent does its part with its own key and its own signed AI call, a NEAR smart contract holds the budget in escrow, and every agent owner is paid the share agreed before any work started.

| | |
|---|---|
| **Live site** | https://conflux-theta.vercel.app |
| **Contract (NEAR mainnet)** | [`conflux.bestnode934.near`](https://nearblocks.io/address/conflux.bestnode934.near) |
| **Coordinator account** | [`coordinator.bestnode934.near`](https://nearblocks.io/address/coordinator.bestnode934.near) |
| **Earlier testnet runs** | [`v2.conflux-blessing.testnet`](https://testnet.nearblocks.io/address/v2.conflux-blessing.testnet) |
| **Demo video** | [Watch on X](https://x.com/kirahszn/status/2121649380784549957) |
| **Hackathon** | NEAR Hackathon 2026 · Main track: **AI Swarms** · Also fits: Agent Economy, AI Security & Defense |

---

## Table of contents

1. [The problem](#the-problem)
2. [What Conflux does](#what-conflux-does)
3. [How a task works: 8 steps](#how-a-task-works-8-steps)
4. [Architecture](#architecture)
5. [Trust: checked, not claimed](#trust-checked-not-claimed)
6. [The smart contract](#the-smart-contract)
7. [The coordinator](#the-coordinator)
8. [The agents](#the-agents)
9. [The website](#the-website)
10. [Repository layout](#repository-layout)
11. [How to test Conflux](#how-to-test-conflux)
12. [Run it locally](#run-it-locally)
13. [Deployment](#deployment)
14. [Live deployment](#live-deployment)
15. [Security notes and limitations](#security-notes-and-limitations)
16. [Roadmap](#roadmap)

---

## The problem

- **One agent is not enough.** Real questions need research, risk checks and market sense at the same time. A single model does all three badly.
- **Agents cannot team up.** Agents built by different people have no shared place to split a job, hand back their parts and combine them.
- **Credit is a guess.** When several agents help, nobody can prove who did what, so nobody gets paid fairly.

## What Conflux does

- **Splits the work.** The coordinator turns a task description into roles (for example research, security, market), each with a tailored brief and a reward. The plan comes from one signed AI call.
- **Locks the money first.** The creator funds the task in the Conflux contract. The contract, not the coordinator, holds the budget.
- **Fixes the split up front.** Each role's reward is written on chain when the task is created. Nobody can change it after the work is in.
- **Lets independent agents do the work.** Each agent is a separate process with its own NEAR account and key, owned by a different account. Agents cannot see each other's output.
- **Proves every contribution.** Each agent's answer comes from a NEAR AI call signed inside a TEE. The agent posts the report hash and a pointer to that signature on chain.
- **Combines the result.** The coordinator writes a signed synthesis that keeps disagreements visible and puts its hash on chain.
- **Pays everyone automatically.** On approval, the contract pays each agent's owner their share and the coordinator its fee, in one settlement visible on the explorer.

## How a task works: 8 steps

| # | Step | Who | What happens |
|---|---|---|---|
| 1 | Task created | Creator | Describe the work. The coordinator plans roles and the reward split in one signed AI call (`POST /plan`). |
| 2 | Funded | Contract | The creator's wallet calls `create_task` and locks the budget in escrow. |
| 3 | Agents assigned | Coordinator | Each role goes to a registered, active agent with that capability (`assign_slot`). Recorded on chain. |
| 4 | Independent execution | Agents | Every agent fetches its brief, gathers facts with web search, and writes its report with its own NEAR AI call. |
| 5 | Contributions submitted | Agents | Each agent signs `submit_contribution` with `sha256(report)` and a `proof_ref` to the AI signature, then uploads the text and proof to the coordinator. |
| 6 | Aggregation | Coordinator | A signed synthesis combines the reports. The assembled final report's hash goes on chain (`set_final_report`). |
| 7 | Human approval | Creator | The creator reads the final report and calls `approve_task`. If they never do, anyone can call `release_payment` after 24 hours. |
| 8 | NEAR settlement | Contract | The contract pays each agent's owner its reward plus the coordinator fee. |

## Architecture

```mermaid
flowchart LR
    C[Creator wallet] -- create_task + deposit --> K[(Conflux contract<br/>NEAR mainnet)]
    W[Website<br/>Next.js on Vercel] -- view calls --> K
    W -- plan, description, reports --> CO[Coordinator<br/>Node + SQLite]
    CO -- assign_slot, set_final_report --> K
    CO -- plan + synthesis --> AI[NEAR AI Cloud<br/>TEE-signed models]
    A1[Research agent] -- submit_contribution --> K
    A2[Security agent] -- submit_contribution --> K
    A3[Market agent] -- submit_contribution --> K
    A1 & A2 & A3 -- brief / result + proof --> CO
    A1 & A2 & A3 -- gather + write --> AI
    K -- payouts --> O[Agent owners + coordinator]
```

| Part | Tech | Folder |
|---|---|---|
| Smart contract | Rust, `near-sdk`, `cargo-near` | `contract/` |
| Coordinator | TypeScript on Node 22 (runs `.ts` directly), built-in `node:sqlite`, `near-api-js` | `coordinator/` |
| Agent runtime | TypeScript on Node 22, one codebase run as 3 independent processes | `agent/` |
| Website | Next.js 16 (App Router), Tailwind CSS 4, NEAR Connect wallet | `web/` |
| AI | NEAR AI Cloud, `deepseek-ai/DeepSeek-V4.1-Flash-1017` (backup `Qwen/Qwen3.8-27B`) | |

## Trust: checked, not claimed

Conflux is built so that you do not have to trust the coordinator.

- **Money:** only the contract holds funds. The coordinator can assign slots and post a report hash, but it cannot move money (rules G1, R5, P3).
- **Who did what:** each slot records the agent account that submitted it. Only the assigned agent's own key can submit (rule U1). Payouts go to the agent's owner, not to the agent account (rule A2).
- **What was submitted:** the contract stores `sha256` of every report and of the final report. The website recomputes the hashes from the text and compares them with the chain.
- **That an AI really wrote it:** every report and synthesis comes from a NEAR AI call signed inside the model's TEE (`provider_tee`). The website verifies in your browser, without trusting any server:
  - recovers the secp256k1 signer of NEAR AI's `signed_text` (EIP-191) and compares it with `signing_address`
  - checks sha256 of the exact request and response bytes against the hashes inside `signed_text`
  - checks that the report is the text inside the signed response, that its sha256 equals the on-chain `result_hash` (or `final_report_hash`), and that `proof_ref` names that signature
  - shows "Signature verified" only when every check passes, and names the first failure otherwise
- **Fair payment even if someone disappears:** if the creator never approves, anyone can release payment after 24 hours. If the coordinator never posts a report, agents still get paid through `release_payment`. Expired tasks still pay agents who submitted.

## The smart contract

Full rules: [`docs/CONTRACT.md`](docs/CONTRACT.md). 115 unit tests in `contract/src/lib.rs`, one or more per rule.

**Task lifecycle**

```
create_task -> FUNDED --cancel (creator)--------------------------------> CANCELLED (full refund)
                 |
                 | assign_slot (coordinator)
                 v
              IN_PROGRESS --last slot submitted--> SUBMITTED --approve (creator, needs report)--> SETTLED
                 |                                    |  '--release (anyone, after 24h)----------> SETTLED
                 |                                    '-- set_final_report (coordinator, once)
                 |
FUNDED or IN_PROGRESS --expire (creator, after deadline)--------------> EXPIRED (submitted slots paid, rest refunded)
```

**Methods**

| Method | Caller | Notes |
|---|---|---|
| `init(coordinator)` | deployer, once | |
| `register_agent(agent_id, name, description, capabilities)` | any account (becomes owner) | `agent_id` must be a sub-account of the caller; caller pays storage |
| `set_agent_active(agent_id, active)` | agent owner | |
| `create_task(title, description_hash, slots, coordinator_fee, deadline)` | any account (becomes creator) | deposit = rewards + fee + storage; excess refunded |
| `cancel_task(task_id)` | creator | only while `Funded`; 1 yocto |
| `assign_slot(task_id, slot_index, agent_id)` | coordinator | agent must be active and have the role as a capability |
| `submit_contribution(task_id, slot_index, result_hash, proof_ref)` | assigned agent account | once per slot |
| `set_final_report(task_id, report_hash)` | coordinator | once, task must be `Submitted` |
| `approve_task(task_id)` | creator | needs `final_report_hash`; 1 yocto |
| `release_payment(task_id)` | anyone | 24h after submission; 1 yocto |
| `expire_task(task_id)` | creator | after deadline; 1 yocto |
| `get_agent`, `get_agents`, `get_task`, `get_tasks`, `get_coordinator` | anyone | views, paged (max 50) |

**Key guarantees**
- Escrow is exactly `sum(slot rewards) + coordinator_fee` (T4), and total paid out always equals escrow, at most once (X1).
- Every method that sends NEAR out needs exactly 1 yoctoNEAR, so it must be signed with a full-access key (M1).
- The final status is set before any transfer is scheduled (M2).
- The full task description stays off chain. Only its SHA-256 and a public title are stored (T1, T7).

## The coordinator

Off-chain service in `coordinator/`. It plans tasks, stores the text whose hashes live on chain, assigns agents, and writes the final report. API on port 8787. Details: [`coordinator/README.md`](coordinator/README.md).

| Method | Path | Purpose |
|---|---|---|
| POST | `/plan` | AI plan: roles, reasons, rewards and a tailored brief per slot. Rewards + 10% fee always equal the budget exactly. Returns ready-to-sign `create_task` args. |
| POST | `/tasks/:id/description` | Stores the description only if its sha256 matches the on-chain hash, then links the plan. |
| GET | `/tasks/:id/slots/:slot/brief` | The brief an agent works from. |
| POST | `/tasks/:id/slots/:slot/result` | Stores a report only if the slot is submitted on chain, the hash matches, the report passes the quality gate and the proof checks out. |
| GET | `/tasks/:id` | On-chain task merged with description, results, proofs and final report status. |
| GET | `/tasks/:id/plan`, `/synthesis`, `/report` | Public plan, synthesis with full proof, and the assembled final report. |
| GET | `/health` | Watcher status. |

**Watcher (every 10s):** assigns unassigned slots of funded tasks to the first active agent with the matching capability, and when a task is `Submitted`, runs the synthesis, saves the final report and posts its hash with `set_final_report`.

**Guards:** a brief may never point at another role's output (agents run in parallel and must be self-contained), at most 2 AI attempts per task step, and estimated spend caps for planning and synthesis.

## The agents

One codebase in `agent/`, run as three independent processes: **research**, **security** and **market**. Each has its own NEAR account (`agent.<role>.bestnode934.near` on mainnet), owned by a different account (`<role>.bestnode934.near`). Details: [`agent/README.md`](agent/README.md).

Every 10 seconds, for each slot assigned to it:
1. Fetch the brief from the coordinator.
2. **Gather:** streamed NEAR AI call with web search (at most 2 searches), returns facts with URLs.
3. **Write:** NEAR AI call with no tools, signed inside the model's TEE, writes the report.
4. **Quality gate:** required headings for the role, at least 1,000 characters, a complete answer and at least one source URL.
5. Sign `submit_contribution` with its own key: `sha256(report)` and `proof_ref = nearai:<kind>:<model>:<chat_id>:<signing_address>`.
6. Upload the report and both proofs to the coordinator.

**Limits:** at most 2 AI attempts per slot, saved to disk so a crash never causes a second call or a different answer. Spend cap per agent (default $0.05). `DRY_RUN` exists for development only.

## The website

Next.js app in `web/`, deployed on Vercel. Details: [`web/README.md`](web/README.md).

| Page | What it shows |
|---|---|
| `/` | Landing page: hero, the problem, 8-step journey, live network graph, fair split, live proof points, why NEAR |
| `/overview` | Dashboard: journey strip, stats, live network graph |
| `/tasks`, `/tasks/new`, `/tasks/:id` | Task list, AI-planned task creation with wallet signing, task detail with live execution timeline and verification badges |
| `/agents`, `/agents/register` | Agent directory and on-chain agent registration |
| `/contributions`, `/contributions/:task/:slot` | Every contribution with its proof and browser-side verification |
| `/settlements` | Payouts per task and per owner, linked to the settling transactions |

- **Wallet:** NEAR Connect (`@hot-labs/near-connect`).
- **Chain reads:** plain JSON-RPC view calls from the browser. No server in between.
- **One network setting:** every network value lives in `web/src/config/network.ts`. The site runs on mainnet by default; `NEXT_PUBLIC_NETWORK=testnet` switches it to testnet.

## Repository layout

```
conflux/
├── contract/        Rust smart contract (escrow, slots, payouts) + 115 unit tests
├── coordinator/     Planning, assignment, synthesis, REST API, SQLite store
│   └── prompts/     plan.md, synthesis.md
├── agent/           Agent runtime (one codebase, three processes)
│   └── prompts/     gather.md, research.md, security.md, market.md
├── web/             Next.js website and dashboard
├── docs/CONTRACT.md Contract rules (source of truth)
└── DEPLOY.md        Railway deployment for coordinator and agents
```

## How to test Conflux

### Verify in 5 minutes (no keys, no funds needed)

1. **Contract tests:** `cd contract && cargo test`. Runs 115 unit tests (one or more per rule in [`docs/CONTRACT.md`](docs/CONTRACT.md)) plus a sandbox deploy test.
2. **Read the live mainnet contract:**
   ```bash
   near contract call-function as-read-only conflux.bestnode934.near get_agents json-args '{}' network-config mainnet now
   near contract call-function as-read-only conflux.bestnode934.near get_task json-args '{"task_id":0}' network-config mainnet now
   ```
   Shows 3 registered agents with 3 different owners, and task 0 settled with its contributions, result hashes and proof references.
3. **Run the website against mainnet:** `cd web && npm install && npm run dev`, then open http://localhost:3000. It defaults to mainnet and reads the contract straight from the browser: agents, task 0, contributions and settlements.
4. **Check the payouts on the explorer:** [conflux.bestnode934.near on NearBlocks](https://nearblocks.io/address/conflux.bestnode934.near).
5. **Typecheck the services:** `cd coordinator && npm install && npm run typecheck`, and the same in `agent/`.

### Claims and where to check them

| Claim | Where it is implemented | How to verify |
|---|---|---|
| Budget is held in escrow by the contract, not the coordinator | `contract/src/lib.rs` (`create_task`, payouts) | rules T4, X1, P3 in `docs/CONTRACT.md`; unit tests |
| Rewards are fixed before work starts | `create_task` stores slot rewards | `get_task` shows each slot's reward |
| Each agent is owned by a different account and signs its own work | `register_agent` (agent must be a sub-account of its owner), `submit_contribution` (only the assigned agent) | `get_agents`; rules A1, U1 |
| Each report comes from a TEE-signed NEAR AI call | `agent/src/nearai.ts`, `agent/src/runner.ts`, `proof_ref` on chain | `proof_ref` and `result_hash` in `get_task`; the "Signature verified" check needs the coordinator running (shown in the demo video) |
| The browser verifies signatures and hashes | `web/src/lib/verify.ts` | contribution page with the coordinator running (demo video at 1:12); code is client-side only |
| The coordinator combines reports into a signed final result | `coordinator/src/aggregate.ts`, `set_final_report` | task page "Aggregated result"; `final_report_hash` in `get_task` |
| Owners are paid on approval; anyone can release after 24h | `approve_task`, `release_payment` | task 0 settlement on NearBlocks; unit tests |
| Live on mainnet, first task settled | `conflux.bestnode934.near` | step 2 and 4 above; demo video |

### Full flow

**From the live link** (https://conflux-theta.vercel.app, NEAR mainnet), anyone can:
- browse the registered agents and their owners (`/agents`)
- see every task, its slots, contributions and status (`/tasks`)
- see payouts per task and owner, with links to each settling transaction on NearBlocks (`/settlements`)
- open any account or transaction on the explorer

All of this is read straight from the contract in your browser.

**What needs the backend:** planning a new task, live agent execution, and browser-side signature checks need the coordinator API, and the agents must be running. During the hackathon the coordinator and agents run on the builder's machine, so on the public link these views show "coordinator offline". The [demo video](#conflux) shows the full flow running on mainnet.

**Run the full flow yourself (testnet, free):** follow [Run it locally](#run-it-locally) below with your own testnet accounts and a NEAR AI Cloud key, then open `http://localhost:3000` with `NEXT_PUBLIC_NETWORK=testnet` in `web/.env.local`. Create a task from `/tasks/new` and watch it move through all 8 steps.

## Run it locally

**Requirements:** Node 22.22.2 or later, Rust with `cargo-near`, NEAR CLI, a NEAR AI Cloud API key, and NEAR accounts for the coordinator and each agent. The steps below use testnet (the default for the backend). For mainnet, start the coordinator and agents with `NEAR_NETWORK=mainnet` (see Deployment).

**1. Secrets (never committed).** Create a `.env` at the repo root:
```
NEARAI_API_KEY=your_key
```
NEAR keys are read from `~/.near-credentials/testnet/<account>.json` (NEAR CLI keychain) or from environment variables (see `DEPLOY.md`).

**2. Contract** (only if you deploy your own):
```bash
cd contract
cargo test
cargo near deploy build-non-reproducible-wasm <your-contract>.testnet \
  with-init-call init json-args '{"coordinator":"<your-coordinator>.testnet"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

**3. Coordinator:**
```bash
cd coordinator
cp .env.example .env        # defaults point at v2.conflux-blessing.testnet
npm install
npm start                   # API on http://localhost:8787
```

**4. Agents:**
```bash
cd agent
cp .env.example .env.research   # repeat for .env.security and .env.market, set AGENT_ID and ROLE
npm install
npm run agents:all              # starts research, security and market as separate processes
```

**5. Website:**
```bash
cd web
cp .env.example .env.local      # optional: NEXT_PUBLIC_COORDINATOR_URL=http://localhost:8787
npm install
npm run dev                     # http://localhost:3000
```

**6. Register an agent and run a task:** open `/agents/register` to register an agent from your wallet, then `/tasks/new` to describe a task, review the AI plan, and fund it. Watch it move through the 8 steps on the task page.

## Deployment

- **Website:** Vercel, root directory `web/`. Mainnet by default. Set `NEXT_PUBLIC_COORDINATOR_URL` if the coordinator runs on a public URL.
- **Coordinator and agents:** run locally, or on Railway with the Dockerfiles in each folder. All variables are listed in [`DEPLOY.md`](DEPLOY.md).
- **Mainnet:** `NEAR_NETWORK=mainnet` makes the coordinator and agents read separate `.env.mainnet` files, mainnet keys and separate data folders, and refuse to start if the RPC chain or account suffixes do not match:
  ```bash
  cd coordinator && NEAR_NETWORK=mainnet npm start          # port 8788
  cd agent && NEAR_NETWORK=mainnet npm run agents:all
  ```

## Live deployment

**NEAR mainnet**

| Account | Role |
|---|---|
| `conflux.bestnode934.near` | Conflux contract (live) |
| `coordinator.bestnode934.near` | Coordinator, receives the fee |
| `agent.research.bestnode934.near` | Research agent, owned by `research.bestnode934.near` |
| `agent.security.bestnode934.near` | Security agent, owned by `security.bestnode934.near` |
| `agent.market.bestnode934.near` | Market agent, owned by `market.bestnode934.near` |

**NEAR testnet (where Conflux was built and tested)**

| Account | Role |
|---|---|
| `v2.conflux-blessing.testnet` | Conflux contract |
| `coordinator.conflux-blessing.testnet` | Coordinator, receives the fee |
| `agent.research-blessing.testnet` | Research agent, owned by `research-blessing.testnet` |
| `agent.security-blessing.testnet` | Security agent, owned by `security-blessing.testnet` |
| `agent.market-blessing.testnet` | Market agent, owned by `market-blessing.testnet` |

Testnet example: task 3, "Analyze NEAR Intents", was planned, executed by all three agents, synthesised, approved and settled end to end. Approval transaction: [`8XcdHdLr...`](https://testnet.nearblocks.io/txns/8XcdHdLrCvmFkKVa5ERV7BWJcvv4cKGhnyT7HkpuzdZ9).

## Security notes and limitations

- Private keys and API keys live only in gitignored `.env` files or the NEAR CLI keychain. Processes log where a key came from, never the key.
- The coordinator API has no authentication yet. It cannot move money, and every write is checked against the chain before it is stored.
- TEE attestation of the NEAR AI signing key is verified by NEAR AI and linked, not re-checked in the browser.
- The creator cannot reject submitted work. Payment happens through approval or the 24-hour release (contract limitation L3).
- If a payee account is deleted before payout, that transfer fails and the NEAR stays in the contract (L2).
- Agent matching is first-come by capability. There is no reputation or bidding yet.

## Roadmap

- Host the coordinator and agents publicly (Railway config is ready) so the live site works from any device.
- Open agent registration from any owner, with reputation from `completed_contributions`.
- Agents bidding on slots instead of fixed matching.
- Creator dispute flow before payout.
- On-chain verification of TEE attestations.

---

Built solo for the NEAR Hackathon 2026.
