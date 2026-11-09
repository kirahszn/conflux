# Conflux Contract — Rules (Stage 2A + 2B + 3.1)

The contract holds a task's money in escrow and, when the work is done, pays
each agent's owner the reward agreed for their slot. This file is the source of
truth for what the contract allows. Network: NEAR **testnet** only.

Stage 2A: registration, task creation, cancellation, views.
Stage 2B: assign, submit, approve, release after review period, expire.
Stage 3.1: agent name/description, task title, coordinator's final report hash.

Time words: "before deadline" means `now < deadline`; "after deadline" means
`now >= deadline`. `now` is the block timestamp in nanoseconds.

---

## 1. Entities

### Agent
| Field                     | Type          | Notes                                         |
|---------------------------|---------------|-----------------------------------------------|
| `agent_id`                | `AccountId`   | Must be a sub-account of `owner` (rule A1)    |
| `owner`                   | `AccountId`   | The account that registered it. Receives payouts. |
| `name`                    | `String`      | Display name, 1–64 chars (rule A7). Public.   |
| `description`             | `String`      | 0–280 chars (rule A8). Public.                |
| `capabilities`            | `Vec<String>` | Short tags, e.g. `"research"`, `"code"`       |
| `active`                  | `bool`        | Only active agents can be assigned            |
| `registered_at`           | `u64`         | Block timestamp (ns)                          |
| `completed_contributions` | `u64`         | +1 each time one of its slots is paid         |

### Task
| Field              | Type             | Notes                                          |
|--------------------|------------------|------------------------------------------------|
| `id`               | `u64`            | Auto-increment, starts at 0                    |
| `creator`          | `AccountId`      | Account that called `create_task` and paid     |
| `title`            | `String`         | 1–100 chars, **public** (rule T7)              |
| `description_hash` | `String`         | 64-char lowercase hex SHA-256. Never full text.|
| `slots`            | `Vec<Slot>`      | 1–10 slots                                     |
| `coordinator_fee`  | `NearToken`      | Paid to the coordinator on settlement          |
| `escrow`           | `NearToken`      | Sum of slot rewards + `coordinator_fee`        |
| `status`           | `TaskStatus`     | See section 2                                  |
| `deadline`         | `u64`            | Timestamp (ns). Must be in the future at creation |
| `created_at`       | `u64`            | Block timestamp (ns)                           |
| `submitted_at`     | `Option<u64>`    | Set when the last slot is submitted            |
| `final_report_hash`| `Option<String>` | 64-char lowercase hex; set once by the coordinator (rules R1–R5) |

### Slot
| Field          | Type                | Notes                                        |
|----------------|---------------------|----------------------------------------------|
| `role`         | `String`            | e.g. `"research"`, 1–32 chars                |
| `reward`       | `NearToken`         | Must be > 0                                  |
| `agent_id`     | `Option<AccountId>` | `None` until assigned                        |
| `result_hash`  | `Option<String>`    | 64-char lowercase hex; set on submit         |
| `proof_ref`    | `Option<String>`    | Optional pointer to proof (≤ 256 chars)      |
| `submitted_at` | `Option<u64>`       | Set on submit                                |

A slot is **submitted** when `result_hash` is set.

---

## 2. Task lifecycle

```
 create_task ─► FUNDED ──cancel (creator)─────────────────────────────► CANCELLED  full refund
                  │
                  │ assign_slot (coordinator)
                  ▼
               IN_PROGRESS ──last slot submitted──► SUBMITTED ──approve (creator, needs report)──► SETTLED
                  │                                   │ └──release (anyone, ≥24h later)─────────► SETTLED
                  │                                   └ set_final_report (coordinator, once; status unchanged)
                  │
 FUNDED or IN_PROGRESS ──expire (creator, after deadline)──────────────► EXPIRED   submitted slots paid,
                                                                                    rest refunded
```

| Status        | Meaning                                                     |
|---------------|-------------------------------------------------------------|
| `Funded`      | Created and escrow paid. No slot assigned yet.              |
| `InProgress`  | At least one slot assigned; not all submitted.              |
| `Submitted`   | Every slot has a submitted result. Waiting for payout.      |
| `Settled`     | Rewards paid to agent owners, fee to coordinator.           |
| `Cancelled`   | Creator cancelled while `Funded`; escrow refunded.          |
| `Expired`     | Creator expired it after the deadline; see rule E3.         |

`Settled`, `Cancelled`, `Expired` are final — no further changes, no further payouts.

---

## 3. Methods and who can call them

| Method                                                       | Kind              | Caller                         |
|--------------------------------------------------------------|-------------------|--------------------------------|
| `init(coordinator)`                                          | init              | deployer, once                 |
| `register_agent(agent_id, name, description, capabilities)`  | payable           | any account (becomes owner)    |
| `set_agent_active(agent_id, active)`                         | change            | agent's owner                  |
| `create_task(title, description_hash, slots, coordinator_fee, deadline)` | payable | any account (becomes creator) |
| `cancel_task(task_id)`                                       | payable (1 yocto) | task creator                   |
| `assign_slot(task_id, slot_index, agent_id)`                 | change            | coordinator                    |
| `submit_contribution(task_id, slot_index, result_hash, proof_ref)` | change      | the slot's assigned agent account |
| `set_final_report(task_id, report_hash)`                     | change            | coordinator                    |
| `approve_task(task_id)`                                      | payable (1 yocto) | task creator                   |
| `release_payment(task_id)`                                   | payable (1 yocto) | anyone                         |
| `expire_task(task_id)`                                       | payable (1 yocto) | task creator                   |
| `get_agent`, `get_agents`, `get_task`, `get_tasks`, `get_coordinator` | view     | anyone                         |

Pagination: `from_index` defaults to 0, `limit` defaults to 20 and is capped at 50.

---

## 4. Rules

### Init
- **I1.** The contract is initialised once with a single `coordinator` account.
  It cannot be re-initialised. (Changing the coordinator is not supported.)

### Agents
- **A1.** `agent_id` must end with `"." + caller` (it is a sub-account of the
  caller). Example: caller `alice.testnet` may register `writer.alice.testnet`,
  but not `writer.bob.testnet` and not `alice.testnet` itself.
- **A2.** The caller becomes the agent's `owner`. All payouts for that agent go
  to the owner, never to the agent account.
- **A3.** An `agent_id` can be registered only once.
- **A4.** New agents start `active = true`. Only the owner can change `active`.
- **A5.** `capabilities`: at most 10 tags, each 1–32 chars.
- **A6.** The contract does not check that `agent_id` exists on-chain (a
  contract can't check that synchronously). Ownership is proven by rule A1.
- **A7.** `name` is required, 1–64 characters. Set once in `register_agent`;
  there is no method to change it yet.
- **A8.** `description` is 0–280 characters (may be empty). Set once in
  `register_agent`; there is no method to change it yet.
- **A9.** `name` and `description` are public: `get_agent` and `get_agents`
  return them. Names are not unique and are not checked; the `agent_id` is the
  identity.

### Tasks
- **T1.** `description_hash` must be exactly 64 lowercase hex chars (SHA-256).
  The full description is stored off-chain; the contract never stores it.
- **T7.** `title` is required, 1–100 characters, and is stored on-chain in
  plain text, so **anyone can read it** via `get_task` / `get_tasks`. Do not put
  private details in the title. The full description stays off-chain; only
  its hash is stored (T1).
- **T8.** Character limits (A7, A8, T7) count Unicode characters, not bytes,
  so `"Café"` is 4 characters. Other limits (capability tags, roles,
  `proof_ref`) count bytes as before.
- **T2.** 1–10 slots; each `role` 1–32 chars (same limit as a capability tag,
  so every role can be matched by rule G5). `coordinator_fee` may be 0.
- **T3.** Every slot `reward` must be greater than zero.
- **T4.** The task's recorded `escrow` is exactly `sum(slot rewards) +
  coordinator_fee` (overflow is rejected). Storage cost and any excess deposit
  are never part of escrow.
- **T5.** New tasks start in `Funded` with every slot unassigned.
- **T6.** `deadline` is a timestamp in nanoseconds and must be strictly later
  than the block timestamp at creation. Expiry and reclaim logic come in Stage 2B.
- **F1.** At settlement, the `coordinator_fee` is paid to the
  coordinator account set at init. Slot rewards go to each assigned agent's owner.
- **C1.** Only the task's creator can call `cancel_task`.
- **C2.** Cancel is allowed only while the task is `Funded` (no slot assigned).
- **C3.** Cancel refunds the full `escrow` to the creator and sets status
  `Cancelled`. The task record is kept for history.

### Deposits and storage
- **S1.** `register_agent` and `create_task` measure the storage they add and
  charge the caller for it (`bytes_added × storage_byte_cost`).
- **S2.** `register_agent`: attached deposit must be ≥ storage cost. Excess is
  refunded to the caller.
- **S3.** `create_task`: attached deposit must be ≥ `sum(rewards) +
  coordinator_fee + storage cost`. Anything above that is refunded to the
  caller. Less fails and nothing is stored.
- **S4.** Storage paid for a cancelled task is not refunded (the record stays).

### Money-moving methods
- **M1.** Every method that sends NEAR out of the contract (in 2A:
  `cancel_task`, `approve_task`, `release_payment`, `expire_task`) requires exactly
  1 yoctoNEAR attached. This proves the call was signed with a full-access
  key, not a limited function-call key a website might hold. The 1 yocto is
  kept by the contract. (`register_agent` and `create_task` only *refund*
  excess deposit, and already require a deposit, so M1 does not apply.)
- **M2.** The final status (`Cancelled`, `Settled`, `Expired`) is set before
  any transfer is scheduled.

### Assign (Stage 2B)
- **G1.** Only the coordinator can call `assign_slot`.
- **G2.** Task must be `Funded` or `InProgress`.
- **G3.** Must be before the deadline.
- **G4.** `slot_index` must exist.
- **G5.** The agent must be registered, `active`, and have the slot's `role`
  in its `capabilities` (exact, case-sensitive match).
- **G6.** The slot must not be submitted yet. Reassigning an unsubmitted slot
  is allowed and replaces the previous agent.
- **G7.** The task becomes `InProgress`.
- **G8.** One agent may hold more than one slot.

### Submit (Stage 2B)
- **U1.** Caller must be the slot's assigned agent account (not its owner).
- **U2.** Task must be `InProgress`, and it must be before the deadline.
- **U3.** A slot can be submitted only once.
- **U4.** `result_hash` is 64 lowercase hex chars. `proof_ref`, if given, is
  at most 256 chars.
- **U5.** The slot records `submitted_at = now`.
- **U6.** When every slot is submitted, the task becomes `Submitted` and records
  `submitted_at = now`. From then on the deadline no longer matters.
- **U7.** Deactivating an agent after assignment does not block its submission
  or its payment.

### Final report (Stage 3.1)
- **R1.** Only the coordinator can call `set_final_report(task_id, report_hash)`.
- **R2.** The task must be `Submitted`.
- **R3.** `report_hash` is 64 lowercase hex chars (SHA-256 of the aggregated
  report, which is stored off-chain).
- **R4.** It can be set only once per task; a second call fails.
- **R5.** It does not change the task status, does not move money, and needs
  no deposit. It is stored as the task's `final_report_hash`.

### Pay out (Stage 2B, changed in 3.1)
- **P1.** `approve_task`: creator only, 1 yocto, task `Submitted`, **and
  `final_report_hash` must be set** (the creator approves a report they can see).
- **P2.** `release_payment`: anyone, 1 yocto, task `Submitted`, and
  `now >= submitted_at + REVIEW_PERIOD` (24 hours). Lets agents get paid if the
  creator never approves. **Does not require `final_report_hash`**, so agents
  still get paid if the coordinator never posts a report.
- **P3.** Both set status `Settled` first (M2), then pay each slot's `reward` to
  the owner of the slot's agent and `coordinator_fee` to the coordinator.
  Zero amounts are skipped. Each paid agent's `completed_contributions` += 1.

### Expire (Stage 2B)
- **E1.** `expire_task`: creator only, 1 yocto, after the deadline.
- **E2.** Task must be `Funded` or `InProgress` (a `Submitted` task cannot be
  expired; it is settled through P1/P2).
- **E3.** Status becomes `Expired` first. Submitted slots are paid to their
  agent's owner (+1 `completed_contributions`). Everything else — unsubmitted
  rewards and the whole `coordinator_fee` — is refunded to the creator in one
  transfer (skipped if zero). The coordinator gets nothing.

### Invariant
- **X1.** For every task, total paid out (agents + coordinator + creator refund)
  equals `escrow` exactly and happens at most once. Storage refunds and the
  1 yocto are separate from escrow.

---

## 5. Known limitations
- **L1.** `assign_slot`, `submit_contribution` and `set_final_report` add a
  little storage (at most ~400 bytes per slot, ≤ 10 slots per task, plus ~70
  bytes for the report hash). The contract's own balance pays for it; callers
  are not charged.
- **L2.** If an owner, coordinator or creator account is deleted before payout,
  its transfer fails and that NEAR returns to the contract with no way to
  recover it yet.
- **L3.** The creator cannot reject submitted work. Once all slots are
  submitted, payment happens via approve or automatically-allowed release
  after 24 hours.
- **L4.** Stage 2B changes the stored data layout, so it must be deployed to a
  fresh account (already the plan), not upgraded over Stage 2A.
- **L5.** Stage 3.1 changes the stored data layout again (new Agent and Task
  fields), so it must go to a fresh account (planned: `v2.conflux-blessing.testnet`).
  It cannot be upgraded over `v1`.
- **L6.** If the coordinator never sets a final report, the creator cannot
  approve; payment then happens through `release_payment` after 24 hours (P2).
