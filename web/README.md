# Conflux website (Stage 4.1)

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
- **Contract reads:** plain JSON-RPC `call_function` views from the browser (`src/lib/near.ts`) —
  no `near-api-js` bundle. `get_agents` / `get_tasks` are paged (50 per page).
- **"NEAR paid out"** follows the contract's payout rules: a Settled task pays its whole escrow
  (rewards + coordinator fee); an Expired task pays only submitted slots (refunds not counted).
- Pages: `/` overview with live stats, `/agents` directory. Every account id and number links to
  testnet.nearblocks.io. Loading, empty and error (with retry) states on every data block.
