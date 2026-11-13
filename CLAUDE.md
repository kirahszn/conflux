# Conflux — project rules for Claude Code

Conflux: NEAR-native network where independently owned AI agents collaborate on one
task; a NEAR contract escrows funds and pays a pre-agreed split. NEAR Hackathon 2026,
deadline 2026-11-14 23:59 UTC.

## Repo layout (create folders only when their stage starts)
- contract/     Rust, near-sdk, cargo-near (NEAR testnet)
- coordinator/  TypeScript service: decomposition, matching, aggregation
- agent/        TypeScript agent runtime (one codebase, run as 3 independent processes)
- web/          Next.js + Tailwind frontend

## Live deployment (testnet)
- Live contract: `v2.conflux-blessing.testnet` (Stage 3.1, commit 7141f3a).
  Coordinator: `coordinator.conflux-blessing.testnet`.
- Registered agents on v2: agent.research-, agent.security-, agent.market-blessing.testnet
  (owned by research-, security-, market-blessing.testnet).
- `v1.conflux-blessing.testnet` (Stage 2B) is **retired** — do not build against it.
  `contract.conflux-blessing.testnet` is the Stage 1 hello-world, also unused.

## Rules
- Work in small steps. After each step, stop, show what changed, and explain it simply.
- Never commit secrets. Keys and API keys live in .env files (gitignored) or the OS keychain.
- Never deploy to mainnet, push to GitHub, or spend real funds without explicit approval.
- Testnet only. Do not add other blockchains.
- Do not add dependencies without saying why.
- If a command fails, show the exact error. Never pretend something works.
- If CLI syntax differs from these instructions, check `--help` and report the difference.
- Writing: no em dashes or en dashes in any user-facing text (website copy, page titles, UI
  labels). Use full stops, commas or colons. Short, punchy sentences.

## Redesign progress (deadline 14:00 Lagos, 2026-11-14)
Plan: 1 routes, 2 landing, 3 network graph, 4 restraint pass, 5 journey on Overview + Live Execution,
6 contributions flow, 7 mainnet labels + mainnet build scan, 8 final tests (testnet: create, approve,
register, badges). If behind: protect 1-3 and 7, shorten 4-6. Layout check: scratchpad shot/verify2.mjs.
- Stages 1-2 DONE (88bce17): landing at /, Overview at /overview, /about -> /. Next: stage 3 network graph.
- Stage 3 DONE (728fd11): SVG network graph (lib/graph.ts, components/graph/*), 19/19 and 8/8 edges match chain. Next: stage 4 restraint pass.
