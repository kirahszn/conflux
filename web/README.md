# Conflux website (Stage 4.3)

Next.js 16 (App Router) + Tailwind CSS 4. NEAR testnet only, contract `v2.conflux-blessing.testnet`.

```
npm install
cp .env.example .env.local     # optional: NEXT_PUBLIC_NETWORK and overrides (see src/config/network.ts)
npm run dev                    # http://localhost:3000 (binds 0.0.0.0 so Windows can reach WSL)
npm run build && npm start
npm run typecheck
```

- **Network config:** every network-specific value (network id, contract id, RPC, explorer,
  coordinator URL, account suffix, example task) lives in `src/config/network.ts`. Switch with
  `NEXT_PUBLIC_NETWORK=testnet|mainnet`. `NEXT_PUBLIC_CONTRACT_ID`, `NEXT_PUBLIC_COORDINATOR_URL` and
  `NEXT_PUBLIC_NEAR_RPC_URL` override per deployment. The header badge reads the config. A network
  without a contract shows a "Not configured yet" screen. The example task (task 3 snapshot) is
  testnet only and hidden on mainnet.
- **Wallet:** NEAR Connect (`@hot-labs/near-connect`), the connector docs.near.org recommends
  (NEAR Wallet Selector is deprecated). Created in the browser only (`src/lib/wallet.tsx`).
- **Contract reads:** plain JSON-RPC `call_function` views from the browser (`src/lib/near.ts`).
  No `near-api-js` bundle. `get_agents` / `get_tasks` are paged (50 per page). One shared request
  per page load (`src/lib/useChainData.ts`).
- **Signature verification** (`src/lib/verify.ts`, in the browser, no server trusted): for every
  contribution and the final synthesis, recover the secp256k1 signer of NEAR AI's `signed_text`
  (EIP-191) and compare it with `signing_address`; check sha256 of the exact request and response
  bytes against the hashes inside `signed_text`; check the report is the text in the signed response,
  its sha256 equals the on-chain `result_hash` (or `final_report_hash`), and `proof_ref` names that
  signature. "Signature verified" only when every check passes; red names the first failure; grey
  when proofs are unavailable or in the older single-step format. Uses `@noble/curves` and
  `@noble/hashes` 2.2.0, the versions `near-api-js` ships. TEE attestation of the signing key is
  NEAR AI's (https://docs.near.ai/cloud/verification), linked, not checked here.
  Test against real proofs and tampered copies: `node scripts/verify-proofs.mts http://localhost:8787 2,3,5`.
- **"NEAR paid out"** follows the contract's payout rules: a Settled task pays its whole escrow
  (rewards plus coordinator fee). An Expired task pays only submitted slots (refunds not counted).
- **Theme:** dark NEAR look. Deep green to teal gradient, soft NEAR green (`#00EC97`) light beams in
  the hero (inline SVG), near-white text. `.light-scope` switches tokens back to dark-on-light for the
  glass cards and role chips. Every text/background pair used meets WCAG AA. One colour per role in
  `src/lib/roles.ts`. Fonts: Unbounded (headlines, fluid `clamp()` sizes), Geist, JetBrains Mono.
- **Orbit hero** (`src/components/Orbit.tsx`): at most 10 real cards on a flat 2D ellipse around
  the text block. The ellipse is computed from the measured text and card sizes so a card can never
  touch the text or leave the hero. Below 1024px (or if it does not fit) the cards become one scrolling
  row under the buttons. Long values are shortened in code, never clipped by CSS. Hover pauses.
- **Layout:** one container (`container-x`), one section rhythm (`section-y`). Header collapses to a
  menu button below 768px. Buttons and links are at least 44px tall.
- **Activity strip** (`src/lib/feed.ts`): events derived from task records (created, submitted,
  settled, paid, expired). The contract stores no settle or expiry time, so those events show no
  time and are ordered after the last submission (or after the deadline for expiry).
- Pages: `/` home, `/agents` directory, `/tasks`, `/tasks/new` and `/agents/register` placeholders. Every account id
  and number links to testnet.nearblocks.io. Loading, empty and error (with retry) states on every
  data block.
- **Landing sections** (`src/components/landing/`): Plan, Agents, Proof, Synthesis, Settlement,
  Network. All built from task 3's real data (`src/lib/showcase.ts`). Live from the coordinator
  (`/tasks/3`, `/tasks/3/plan`, `/tasks/3/report`) when reachable, otherwise the committed snapshot
  `src/data/task3.json` (the deployed site cannot reach a laptop coordinator). Refresh the snapshot
  with the coordinator running: `node scripts/snapshot-task3.mts`. Animations are CSS only, start when
  a section scrolls into view (`Reveal.tsx`) and are off under `prefers-reduced-motion`.
- **Copy rule:** no em dashes or en dashes in user-facing text (see `/CLAUDE.md`).
