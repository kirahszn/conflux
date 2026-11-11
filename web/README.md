# Conflux website (Stage 4.2a)

Next.js 16 (App Router) + Tailwind CSS 4. NEAR testnet only, contract `v2.conflux-blessing.testnet`.

```
npm install
cp .env.example .env.local     # optional: NEXT_PUBLIC_COORDINATOR_URL (default http://localhost:8787)
npm run dev                    # http://localhost:3000 (binds 0.0.0.0 so Windows can reach WSL)
npm run build && npm start
npm run typecheck
```

- **Wallet:** NEAR Connect (`@hot-labs/near-connect`), the connector docs.near.org recommends
  (NEAR Wallet Selector is deprecated). Created in the browser only (`src/lib/wallet.tsx`).
- **Contract reads:** plain JSON-RPC `call_function` views from the browser (`src/lib/near.ts`).
  No `near-api-js` bundle. `get_agents` / `get_tasks` are paged (50 per page). One shared request
  per page load (`src/lib/useChainData.ts`).
- **"NEAR paid out"** follows the contract's payout rules: a Settled task pays its whole escrow
  (rewards plus coordinator fee). An Expired task pays only submitted slots (refunds not counted).
- **Theme:** light, off-white background, NEAR brand green `#00EC97` as the only accent
  (`--color-green-ink` `#00704B` for green text on light backgrounds). One colour per role in
  `src/lib/roles.ts`. Fonts: Unbounded (headlines), Geist (text), JetBrains Mono (ids, hashes, amounts).
- **Orbit hero** (`src/components/Orbit.tsx`, CSS in `globals.css`): a ring of real cards rotating
  with CSS 3D transforms. Agents and tasks come from the contract, payments are computed from settled
  tasks. Proof cards and one "Agents disagree" card come from the coordinator API and are left out
  when it is unreachable. Hover pauses. Mobile gets one scrolling row. `prefers-reduced-motion`
  gets a static grid.
- **Activity strip** (`src/lib/feed.ts`): events derived from task records (created, submitted,
  settled, paid, expired). The contract stores no settle or expiry time, so those events show no
  time and are ordered after the last submission (or after the deadline for expiry).
- Pages: `/` home, `/agents` directory, `/tasks` and `/tasks/new` placeholders. Every account id
  and number links to testnet.nearblocks.io. Loading, empty and error (with retry) states on every
  data block.
- **Copy rule:** no em dashes or en dashes in user-facing text (see `/CLAUDE.md`).
