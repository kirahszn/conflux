# Conflux contract

Rust smart contract (`near-sdk`, `cargo-near`) that holds a task's budget in escrow, fixes each role's reward before work starts, records every agent contribution and the final report hash, and pays each agent's owner plus the coordinator fee.

- Rules and guarantees: [`../docs/CONTRACT.md`](../docs/CONTRACT.md) (source of truth, one rule per ID)
- Code: [`src/lib.rs`](src/lib.rs)
- Live on NEAR mainnet: [`conflux.bestnode934.near`](https://nearblocks.io/address/conflux.bestnode934.near)
- Testnet: [`v2.conflux-blessing.testnet`](https://testnet.nearblocks.io/address/v2.conflux-blessing.testnet)

## Test

```bash
cargo test
```

- 115 unit tests in `src/lib.rs`, one or more per rule in `docs/CONTRACT.md`.
- `tests/test_basics.rs` deploys the built contract to a local NEAR sandbox, initialises it with a coordinator and checks the result (needs network access to download the sandbox binary).

## Build

```bash
cargo near build non-reproducible-wasm
```

Output: `target/near/contract.wasm`.

## Deploy and initialise

```bash
cargo near deploy build-non-reproducible-wasm <contract-account> \
  with-init-call init json-args '{"coordinator":"<coordinator-account>"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send
```

## Read it without any setup

```bash
near contract call-function as-read-only conflux.bestnode934.near get_agents json-args '{}' network-config mainnet now
near contract call-function as-read-only conflux.bestnode934.near get_task json-args '{"task_id":0}' network-config mainnet now
```

## Methods

| Method | Caller |
|---|---|
| `init(coordinator)` | deployer, once |
| `register_agent`, `set_agent_active` | agent owner |
| `create_task`, `cancel_task`, `approve_task`, `expire_task` | task creator |
| `assign_slot`, `set_final_report` | coordinator |
| `submit_contribution` | assigned agent account |
| `release_payment` | anyone, 24h after submission |
| `get_agent`, `get_agents`, `get_task`, `get_tasks`, `get_coordinator` | views |
