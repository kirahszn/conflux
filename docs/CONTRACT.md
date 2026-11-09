# Conflux Contract — Rules (Stage 2A)

The contract holds a task's money in escrow and, when the work is done, pays
each agent's owner the reward agreed for their slot. This file is the source of
truth for what the contract allows. Network: NEAR **testnet** only.

Stage 2A implements registration, task creation, cancellation and views.
Assign / submit / approve / expire are described here so the lifecycle is
complete, but they are **not implemented yet** (marked *later*).

---

## 1. Entities

### Agent
| Field          | Type          | Notes                                              |
|----------------|---------------|----------------------------------------------------|
| `agent_id`     | `AccountId`   | Must be a sub-account of `owner` (see rule A1)     |
| `owner`        | `AccountId`   | The account that registered it. Receives payouts.  |
| `capabilities` | `Vec<String>` | Short tags, e.g. `"research"`, `"code"`            |
| `active`       | `bool`        | Only active agents can be assigned (*later*)       |
| `registered_at`| `u64`         | Block timestamp (ns)                               |

### Task
| Field              | Type          | Notes                                            |
|--------------------|---------------|--------------------------------------------------|
| `id`               | `u64`         | Auto-increment, starts at 0                      |
| `creator`          | `AccountId`   | Account that called `create_task` and paid       |
| `description_hash` | `String`      | 64-char lowercase hex SHA-256. Never full text.  |
| `slots`            | `Vec<Slot>`   | 1–10 slots                                       |
| `coordinator_fee`  | `NearToken`   | Paid to the coordinator on settlement (*later*)  |
| `escrow`           | `NearToken`   | Sum of slot rewards + `coordinator_fee`          |
| `status`           | `TaskStatus`  | See section 2                                    |
| `deadline`         | `u64`         | Timestamp (ns). Must be in the future at creation |
| `created_at`       | `u64`         | Block timestamp (ns)                             |

### Slot
| Field         | Type                 | Notes                                        |
|---------------|----------------------|----------------------------------------------|
| `role`        | `String`             | e.g. `"researcher"`, 1–64 chars              |
| `reward`      | `NearToken`          | Must be > 0                                  |
| `agent_id`    | `Option<AccountId>`  | `None` until assigned (*later*)              |
| `result_hash` | `Option<String>`     | Hash of submitted output (*later*)           |

---

## 2. Task lifecycle

```
                 cancel_task (creator, no slot assigned)
   create_task  ┌──────────────────────────────────────► CANCELLED  (full refund)
  ─────────────►│
              FUNDED ──assign first slot──► IN_PROGRESS ──all slots submitted──► SUBMITTED ──approve──► SETTLED
                │                              │                                    (payouts)
                └──────── deadline passed ─────┴──────────────────────────────────► EXPIRED   (*later*)
```

| Status        | Meaning                                                  | Stage   |
|---------------|----------------------------------------------------------|---------|
| `Funded`      | Created and escrow paid. No slot assigned yet.           | 2A      |
| `InProgress`  | At least one slot assigned to an agent.                  | later   |
| `Submitted`   | Every slot has a submitted result.                       | later   |
| `Settled`     | Approved; rewards paid to agent owners, fee to coordinator. | later |
| `Cancelled`   | Creator cancelled while `Funded`; escrow refunded.       | 2A      |
| `Expired`     | Deadline passed before settlement; reclaim rules in 2B.  | later   |

`Settled`, `Cancelled`, `Expired` are final — no further changes.

---

## 3. Methods and who can call them

| Method                                   | Kind        | Caller                       | Stage |
|------------------------------------------|-------------|------------------------------|-------|
| `init(coordinator)`                      | init        | deployer, once               | 2A    |
| `register_agent(agent_id, capabilities)` | payable     | any account (becomes owner)  | 2A    |
| `set_agent_active(agent_id, active)`     | change      | agent's owner only           | 2A    |
| `get_agent(agent_id)`                    | view        | anyone                       | 2A    |
| `get_agents(from_index, limit)`          | view        | anyone                       | 2A    |
| `create_task(description_hash, slots, coordinator_fee, deadline)` | payable | any account (becomes creator) | 2A |
| `cancel_task(task_id)`                   | payable (1 yocto) | task creator only            | 2A    |
| `get_task(task_id)`                      | view        | anyone                       | 2A    |
| `get_tasks(from_index, limit)`           | view        | anyone                       | 2A    |
| `get_coordinator()`                      | view        | anyone                       | 2A    |
| `assign_slot` / `submit_result` / `approve_task` / `expire_task` | change | coordinator / agent owner / creator | later |

Pagination: `from_index` defaults to 0, `limit` defaults to 20 and is capped at 50.

---

## 4. Rules

### Init
- **I1.** The contract is initialised once with a single `coordinator` account.
  It cannot be re-initialised. (Changing the coordinator is not supported in 2A.)

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

### Tasks
- **T1.** `description_hash` must be exactly 64 lowercase hex chars (SHA-256).
  The full description is stored off-chain; the contract never stores it.
- **T2.** 1–10 slots; each `role` 1–64 chars. `coordinator_fee` may be 0.
- **T3.** Every slot `reward` must be greater than zero.
- **T4.** The task's recorded `escrow` is exactly `sum(slot rewards) +
  coordinator_fee` (overflow is rejected). Storage cost and any excess deposit
  are never part of escrow.
- **T5.** New tasks start in `Funded` with every slot unassigned.
- **T6.** `deadline` is a timestamp in nanoseconds and must be strictly later
  than the block timestamp at creation. Expiry and reclaim logic come in Stage 2B.
- **F1.** At settlement (*later*), the `coordinator_fee` is paid to the
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
  `cancel_task`; later: settle/expire/reclaim) requires exactly
  1 yoctoNEAR attached. This proves the call was signed with a full-access
  key, not a limited function-call key a website might hold. The 1 yocto is
  kept by the contract. (`register_agent` and `create_task` only *refund*
  excess deposit, and already require a deposit, so M1 does not apply.)
- **M2.** State is updated (e.g. status set to `Cancelled`) before the
  refund transfer is scheduled.
